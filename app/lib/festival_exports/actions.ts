"use server";

import { db } from "@/db";
import {
  festivals,
  festivalDates,
  festivalSectors,
  mapElements,
  stands,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import {
  FestivalExport,
  FestivalInfoTemplate,
  ExportFestivalDataOptions,
  ImportFestivalDataOptions,
} from "./definitions";
import {
  exportFestivalDataOptionsSchema,
  festivalExportSchema,
  importFestivalDataOptionsSchema,
} from "./schemas";
import {
  MapElementTemplate,
  MapTemplate,
  SectorTemplate,
  StandTemplate,
} from "@/app/lib/map_templates/definitions";
import { importTemplateToFestival } from "@/app/lib/map_templates/actions";

export async function exportFestivalData(
  festivalId: number,
  options: ExportFestivalDataOptions,
): Promise<{ success: boolean; data?: FestivalExport; message: string }> {
  try {
    const parsedOptions = exportFestivalDataOptionsSchema.parse(options);

    const festival = await db.query.festivals.findFirst({
      where: eq(festivals.id, festivalId),
      with: {
        festivalDates: true,
        festivalSectors: {
          with: {
            stands: true,
            mapElements: true,
          },
          orderBy: festivalSectors.orderInFestival,
        },
      },
    });

    if (!festival) {
      return { success: false, message: "Festival no encontrado" };
    }

    // Build festival info template
    let festivalInfo: FestivalInfoTemplate | undefined;
    if (parsedOptions.includeBasicInfo) {
      festivalInfo = {
        name: festival.name,
        description: festival.description,
        address: festival.address,
        locationLabel: festival.locationLabel,
        locationUrl: festival.locationUrl,
        festivalType: festival.festivalType,
        mapsVersion: festival.mapsVersion,
        publicRegistration: festival.publicRegistration,
        eventDayRegistration: festival.eventDayRegistration,
        festivalCode: festival.festivalCode,
        dates: festival.festivalDates.map((d) => ({
          startDate: d.startDate.toISOString(),
          endDate: d.endDate.toISOString(),
        })),
      };
    }

    // Build sectors template
    let sectorTemplates: SectorTemplate[] | undefined;
    if (parsedOptions.includeSectors) {
      const filteredSectors = parsedOptions.sectorIds
        ? festival.festivalSectors.filter((s) =>
            parsedOptions.sectorIds!.includes(s.id),
          )
        : festival.festivalSectors;

      if (filteredSectors.length === 0) {
        return { success: false, message: "No se encontraron sectores" };
      }

      sectorTemplates = filteredSectors.map((sector) => ({
        name: sector.name,
        description: sector.description,
        orderInFestival: sector.orderInFestival,
        mapBounds: {
          originX: sector.mapOriginX,
          originY: sector.mapOriginY,
          width: sector.mapWidth,
          height: sector.mapHeight,
        },
        stands: sector.stands.map(
          (stand): StandTemplate => ({
            label: stand.label,
            standNumber: stand.standNumber,
            standCategory: stand.standCategory,
            zone: stand.zone,
            orientation: stand.orientation,
            width: stand.width,
            height: stand.height,
            positionLeft: stand.positionLeft ?? 0,
            positionTop: stand.positionTop ?? 0,
            price: stand.price,
          }),
        ),
        elements:
          sector.mapElements.length > 0
            ? sector.mapElements.map(
                (el): MapElementTemplate => ({
                  type: el.type,
                  label: el.label,
                  labelPosition: el.labelPosition,
                  labelFontSize: el.labelFontSize,
                  showIcon: el.showIcon,
                  labelFontWeight: el.labelFontWeight,
                  rotation: el.rotation ?? 0,
                  positionLeft: el.positionLeft,
                  positionTop: el.positionTop,
                  width: el.width,
                  height: el.height,
                }),
              )
            : undefined,
      }));
    }

    const exportData: FestivalExport = {
      version: "2.0",
      metadata: {
        name: `${festival.name} - Exportacion`,
        createdAt: new Date().toISOString(),
        createdFrom: {
          festivalId: festival.id,
          festivalName: festival.name,
        },
        exportOptions: {
          includeBasicInfo: parsedOptions.includeBasicInfo,
          includeSectors: parsedOptions.includeSectors,
        },
      },
      festival: festivalInfo,
      sectors: sectorTemplates,
    };

    return {
      success: true,
      data: exportData,
      message: "Datos exportados correctamente",
    };
  } catch (error) {
    console.error("Error exporting festival data", error);
    return { success: false, message: "Error al exportar los datos" };
  }
}

export async function importFestivalData(
  festivalId: number,
  exportData: FestivalExport,
  options: ImportFestivalDataOptions,
): Promise<{
  success: boolean;
  message: string;
  details?: {
    basicInfoUpdated: boolean;
    sectorsCreated: number;
    standsCreated: number;
    datesCreated: number;
  };
}> {
  try {
    const parsedData = festivalExportSchema.parse(exportData);
    const parsedOptions = importFestivalDataOptionsSchema.parse(options);

    // Validate we have the data we need
    if (parsedOptions.importBasicInfo && !parsedData.festival) {
      return {
        success: false,
        message:
          "El archivo no contiene informacion basica del festival",
      };
    }

    if (parsedOptions.importSectors && !parsedData.sectors) {
      return {
        success: false,
        message: "El archivo no contiene datos de sectores",
      };
    }

    let basicInfoUpdated = false;
    let sectorsCreated = 0;
    let standsCreated = 0;
    let datesCreated = 0;

    // Import basic info
    if (parsedOptions.importBasicInfo && parsedData.festival) {
      const festivalInfo = parsedData.festival;

      try {
        await db.transaction(async (tx) => {
          // Update festival basic fields
          await tx
            .update(festivals)
            .set({
              name: parsedOptions.nameOverride || festivalInfo.name,
              description: festivalInfo.description,
              address: festivalInfo.address,
              locationLabel: festivalInfo.locationLabel,
              locationUrl: festivalInfo.locationUrl,
              festivalType: festivalInfo.festivalType,
              mapsVersion: festivalInfo.mapsVersion,
              publicRegistration: festivalInfo.publicRegistration,
              eventDayRegistration: festivalInfo.eventDayRegistration,
              festivalCode: festivalInfo.festivalCode,
              updatedAt: new Date(),
            })
            .where(eq(festivals.id, festivalId));

          // Replace dates: delete existing, insert new
          await tx
            .delete(festivalDates)
            .where(eq(festivalDates.festivalId, festivalId));

          if (festivalInfo.dates.length > 0) {
            await tx.insert(festivalDates).values(
              festivalInfo.dates.map((d) => ({
                festivalId,
                startDate: new Date(d.startDate),
                endDate: new Date(d.endDate),
                updatedAt: new Date(),
                createdAt: new Date(),
              })),
            );
          }

          datesCreated = festivalInfo.dates.length;
        });

        basicInfoUpdated = true;
      } catch (error: unknown) {
        // Check for unique name constraint violation
        if (
          error instanceof Error &&
          error.message.includes("unique") &&
          error.message.includes("name")
        ) {
          return {
            success: false,
            message:
              "Ya existe un festival con ese nombre. Cambia el nombre en el archivo e intenta de nuevo.",
          };
        }
        throw error;
      }
    }

    // Import sectors/stands using existing importTemplateToFestival
    if (parsedOptions.importSectors && parsedData.sectors) {
      const hasElements = parsedData.sectors.some((s) => s.elements);
      const mapTemplate: MapTemplate = {
        version: hasElements ? "1.1" : "1.0",
        metadata: {
          name: parsedData.metadata.name,
          createdAt: parsedData.metadata.createdAt,
          createdFrom: parsedData.metadata.createdFrom,
        },
        sectors: parsedData.sectors,
      };

      const result = await importTemplateToFestival(festivalId, mapTemplate, {
        mode: parsedOptions.sectorImportMode,
      });

      if (!result.success) {
        return {
          success: false,
          message: result.message,
          details: {
            basicInfoUpdated,
            sectorsCreated: 0,
            standsCreated: 0,
            datesCreated,
          },
        };
      }

      sectorsCreated = parsedData.sectors.length;
      standsCreated = result.createdStands ?? 0;
    }

    revalidatePath("/dashboard/festivals");
    revalidatePath("/", "layout");
    updateTag("active-festival");

    return {
      success: true,
      message: "Datos importados correctamente",
      details: {
        basicInfoUpdated,
        sectorsCreated,
        standsCreated,
        datesCreated,
      },
    };
  } catch (error) {
    console.error("Error importing festival data", error);
    if (error instanceof z.ZodError) {
      return {
        success: false,
        message: "Estructura de datos invalida",
      };
    }
    return { success: false, message: "Error al importar los datos" };
  }
}

export async function createFestivalFromImport(
  exportData: FestivalExport,
  nameOverride?: string,
): Promise<{
  success: boolean;
  message: string;
  festivalId?: number;
}> {
  try {
    const parsedData = festivalExportSchema.parse(exportData);

    const festivalInfo = parsedData.festival;

    const result = await db.transaction(async (tx) => {
      // Create festival
      const [newFestival] = await tx
        .insert(festivals)
        .values({
          name: nameOverride || (festivalInfo?.name ?? parsedData.metadata.name),
          description: festivalInfo?.description ?? null,
          address: festivalInfo?.address ?? null,
          locationLabel: festivalInfo?.locationLabel ?? null,
          locationUrl: festivalInfo?.locationUrl ?? null,
          status: "draft",
          mapsVersion: festivalInfo?.mapsVersion ?? "v1",
          publicRegistration: festivalInfo?.publicRegistration ?? false,
          eventDayRegistration: festivalInfo?.eventDayRegistration ?? false,
          festivalType: festivalInfo?.festivalType ?? "glitter",
          festivalCode: festivalInfo?.festivalCode ?? null,
          reservationsStartDate: new Date(),
          updatedAt: new Date(),
          createdAt: new Date(),
        })
        .returning();

      // Insert dates
      if (festivalInfo?.dates && festivalInfo.dates.length > 0) {
        await tx.insert(festivalDates).values(
          festivalInfo.dates.map((d) => ({
            festivalId: newFestival.id,
            startDate: new Date(d.startDate),
            endDate: new Date(d.endDate),
            updatedAt: new Date(),
            createdAt: new Date(),
          })),
        );
      }

      // Create sectors with stands and elements
      if (parsedData.sectors && parsedData.sectors.length > 0) {
        for (const sectorTemplate of parsedData.sectors) {
          const [newSector] = await tx
            .insert(festivalSectors)
            .values({
              festivalId: newFestival.id,
              name: sectorTemplate.name,
              description: sectorTemplate.description,
              orderInFestival: sectorTemplate.orderInFestival,
              mapOriginX: sectorTemplate.mapBounds.originX,
              mapOriginY: sectorTemplate.mapBounds.originY,
              mapWidth: sectorTemplate.mapBounds.width,
              mapHeight: sectorTemplate.mapBounds.height,
            })
            .returning();

          // Create stands
          if (sectorTemplate.stands.length > 0) {
            await tx.insert(stands).values(
              sectorTemplate.stands.map((stand) => ({
                label: stand.label,
                standNumber: stand.standNumber,
                standCategory: stand.standCategory,
                zone: stand.zone,
                orientation: stand.orientation,
                width: stand.width,
                height: stand.height,
                positionLeft: stand.positionLeft,
                positionTop: stand.positionTop,
                price: stand.price,
                status: "available" as const,
                festivalId: newFestival.id,
                festivalSectorId: newSector.id,
              })),
            );
          }

          // Create map elements
          const templateElements = sectorTemplate.elements ?? [];
          if (templateElements.length > 0) {
            await tx.insert(mapElements).values(
              templateElements.map((el) => ({
                type: el.type,
                label: el.label,
                labelPosition: el.labelPosition ?? "bottom",
                labelFontSize: el.labelFontSize ?? 2,
                showIcon: el.showIcon ?? true,
                labelFontWeight: el.labelFontWeight ?? 500,
                rotation: el.rotation ?? 0,
                positionLeft: el.positionLeft,
                positionTop: el.positionTop,
                width: el.width,
                height: el.height,
                festivalSectorId: newSector.id,
              })),
            );
          }
        }
      }

      return newFestival;
    });

    revalidatePath("/dashboard/festivals");
    updateTag("active-festival");

    return {
      success: true,
      message: "Festival creado correctamente desde importacion",
      festivalId: result.id,
    };
  } catch (error: unknown) {
    console.error("Error creating festival from import", error);

    if (
      error instanceof Error &&
      error.message.includes("unique") &&
      error.message.includes("name")
    ) {
      return {
        success: false,
        message:
          "Ya existe un festival con ese nombre. Cambia el nombre en el archivo e intenta de nuevo.",
      };
    }

    if (error instanceof z.ZodError) {
      return {
        success: false,
        message: "Estructura de datos invalida",
      };
    }

    return {
      success: false,
      message: "Error al crear el festival desde importacion",
    };
  }
}
