"use server";

import { db } from "@/db";
import {
  festivals,
  festivalDates,
  festivalReservationFeatures,
  festivalSectors,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { expireFestivalCaches } from "@/app/lib/festivals/active-festival-cache";
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
  MapTemplate,
  SectorTemplate,
} from "@/app/lib/map_templates/definitions";
import { importTemplateToFestival } from "@/app/lib/map_templates/actions";
import {
  insertSectorTemplateContents,
  loadSubcategoryLookup,
} from "@/app/lib/map_templates/sector-import";
import {
  buildSectorTemplate,
  SECTOR_TEMPLATE_STAND_RELATIONS,
} from "@/app/lib/map_templates/sector-template";
import {
  toReservationFeatureTemplates,
  writeReservationFeatures,
} from "@/app/lib/festival_exports/reservation-features";
import { recordFestivalCreatedStatus } from "@/app/lib/festivals/status-transitions";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";

type BuildExportResult =
  | { ok: true; data: FestivalExport }
  | { ok: false; message: string };

/**
 * Everything a festival export file holds, read in one place so the download
 * and the one-step duplicate can never drift apart.
 */
async function buildFestivalExport(
  festivalId: number,
  options: ExportFestivalDataOptions,
  { allowNoSectors = false }: { allowNoSectors?: boolean } = {},
): Promise<BuildExportResult> {
  const parsedOptions = exportFestivalDataOptionsSchema.parse(options);

  const festival = await db.query.festivals.findFirst({
    where: eq(festivals.id, festivalId),
    with: {
      festivalDates: true,
      festivalSectors: {
        with: {
          stands: { with: SECTOR_TEMPLATE_STAND_RELATIONS },
          mapElements: true,
        },
        orderBy: festivalSectors.orderInFestival,
      },
    },
  });

  if (!festival) {
    return { ok: false, message: "Festival no encontrado" };
  }

  // Build festival info template
  let festivalInfo: FestivalInfoTemplate | undefined;
  if (parsedOptions.includeBasicInfo) {
    const featureRows = await db
      .select()
      .from(festivalReservationFeatures)
      .where(eq(festivalReservationFeatures.festivalId, festivalId));

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
      dates: [...festival.festivalDates]
        .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
        .map((d) => ({
          startDate: d.startDate.toISOString(),
          endDate: d.endDate.toISOString(),
        })),
      reservationHoldMinutes: festival.reservationHoldMinutes,
      reservationFeatures: toReservationFeatureTemplates(featureRows),
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

    if (filteredSectors.length === 0 && !allowNoSectors) {
      return { ok: false, message: "No se encontraron sectores" };
    }

    sectorTemplates = filteredSectors.map(buildSectorTemplate);
  }

  return {
    ok: true,
    data: {
      version: "2.1",
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
    },
  };
}

export async function exportFestivalData(
  festivalId: number,
  options: ExportFestivalDataOptions,
): Promise<{ success: boolean; data?: FestivalExport; message: string }> {
  try {
    const actor = await requireAdminOrFestivalAdmin();
    if (!actor) {
      return { success: false, message: "No autorizado" };
    }

    const result = await buildFestivalExport(festivalId, options);
    if (!result.ok) {
      return { success: false, message: result.message };
    }

    return {
      success: true,
      data: result.data,
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
    const actor = await requireAdminOrFestivalAdmin();
    if (!actor) {
      return { success: false, message: "No autorizado" };
    }

    const parsedData = festivalExportSchema.parse(exportData);
    const parsedOptions = importFestivalDataOptionsSchema.parse(options);

    // Validate we have the data we need
    if (parsedOptions.importBasicInfo && !parsedData.festival) {
      return {
        success: false,
        message: "El archivo no contiene informacion basica del festival",
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
              // Registration flags are not imported: acreditación opens only
              // through updateFestivalRegistration, which checks the festival
              // is active and offers the visitor invitation.
              festivalCode: festivalInfo.festivalCode,
              ...(festivalInfo.reservationHoldMinutes != null && {
                reservationHoldMinutes: festivalInfo.reservationHoldMinutes,
              }),
              updatedAt: new Date(),
            })
            .where(eq(festivals.id, festivalId));

          if (festivalInfo.reservationFeatures) {
            await writeReservationFeatures(tx, {
              festivalId,
              features: festivalInfo.reservationFeatures,
              updatedByUserId: actor.id,
            });
          }

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
        // Committed: expire now, since the sector import below can still fail
        // and return early.
        expireFestivalCaches();
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
      const mapTemplate: MapTemplate = {
        version: "1.2",
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

    expireFestivalCaches();
    revalidatePath("/dashboard/festivals");
    revalidatePath("/", "layout");

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

type ParsedFestivalExport = z.infer<typeof festivalExportSchema>;

/**
 * Creates a draft festival from an already validated export: its info, dates,
 * reservation features, and every sector with its stands, groups and signage.
 * One transaction, so a failure leaves no half-built festival behind.
 */
async function createFestivalFromExportData(
  parsedData: ParsedFestivalExport,
  input: { nameOverride?: string; actorUserId: number },
): Promise<number> {
  const festivalInfo = parsedData.festival;

  const created = await db.transaction(async (tx) => {
    // Create festival
    const [newFestival] = await tx
      .insert(festivals)
      .values({
        name:
          input.nameOverride ||
          (festivalInfo?.name ?? parsedData.metadata.name),
        description: festivalInfo?.description ?? null,
        address: festivalInfo?.address ?? null,
        locationLabel: festivalInfo?.locationLabel ?? null,
        locationUrl: festivalInfo?.locationUrl ?? null,
        status: "draft",
        mapsVersion: festivalInfo?.mapsVersion ?? "v1",
        // A new festival starts closed, whatever the file says; see
        // importFestivalData.
        publicRegistration: false,
        eventDayRegistration: false,
        festivalType: festivalInfo?.festivalType ?? "glitter",
        festivalCode: festivalInfo?.festivalCode ?? null,
        ...(festivalInfo?.reservationHoldMinutes != null && {
          reservationHoldMinutes: festivalInfo.reservationHoldMinutes,
        }),
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

    if (festivalInfo?.reservationFeatures) {
      await writeReservationFeatures(tx, {
        festivalId: newFestival.id,
        features: festivalInfo.reservationFeatures,
        updatedByUserId: input.actorUserId,
      });
    }

    // Create sectors with stands, groups and elements
    if (parsedData.sectors && parsedData.sectors.length > 0) {
      const subcategoryLookup = await loadSubcategoryLookup(
        tx,
        parsedData.sectors,
      );
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

        await insertSectorTemplateContents(tx, {
          festivalId: newFestival.id,
          sectorId: newSector.id,
          template: sectorTemplate,
          subcategoryLookup,
        });
      }
    }

    await recordFestivalCreatedStatus(tx, {
      festivalId: newFestival.id,
      status: newFestival.status,
      actorUserId: input.actorUserId,
    });

    return newFestival;
  });

  expireFestivalCaches();
  revalidatePath("/dashboard/festivals");

  return created.id;
}

function isDuplicateNameError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes("unique") &&
    error.message.includes("name")
  );
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
    const actor = await requireAdminOrFestivalAdmin();
    if (!actor) {
      return { success: false, message: "No autorizado" };
    }

    const parsedData = festivalExportSchema.parse(exportData);
    const festivalId = await createFestivalFromExportData(parsedData, {
      nameOverride,
      actorUserId: actor.id,
    });

    return {
      success: true,
      message: "Festival creado correctamente desde importacion",
      festivalId,
    };
  } catch (error: unknown) {
    console.error("Error creating festival from import", error);

    if (isDuplicateNameError(error)) {
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

const duplicateFestivalInputSchema = z.object({
  festivalId: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
});

/**
 * Export and import in one step: a new draft festival with the source's info,
 * dates, reservation features, sectors, stands (prices, subcategories, full
 * tables) and map elements.
 *
 * It goes through the same file format as a download — built, validated and
 * created by the same code — so a duplicate is exactly what exporting and
 * importing by hand would give, and nothing the file leaves out (reservations,
 * participants, images, registration) is copied either.
 */
export async function duplicateFestival(input: {
  festivalId: number;
  name: string;
}): Promise<{ success: boolean; message: string; festivalId?: number }> {
  try {
    const actor = await requireAdminOrFestivalAdmin();
    if (!actor) {
      return { success: false, message: "No autorizado" };
    }

    const parsedInput = duplicateFestivalInputSchema.safeParse(input);
    if (!parsedInput.success) {
      return { success: false, message: "Ingresá un nombre para la copia." };
    }

    const built = await buildFestivalExport(
      parsedInput.data.festivalId,
      { includeBasicInfo: true, includeSectors: true },
      { allowNoSectors: true },
    );
    if (!built.ok) {
      return { success: false, message: built.message };
    }

    const parsedData = festivalExportSchema.parse(built.data);
    const festivalId = await createFestivalFromExportData(parsedData, {
      nameOverride: parsedInput.data.name,
      actorUserId: actor.id,
    });

    return {
      success: true,
      message: "Festival duplicado correctamente",
      festivalId,
    };
  } catch (error: unknown) {
    console.error("Error duplicating festival", error);

    if (isDuplicateNameError(error)) {
      return {
        success: false,
        message: "Ya existe un festival con ese nombre. Elegí otro.",
      };
    }

    if (error instanceof z.ZodError) {
      return {
        success: false,
        message:
          "El festival tiene datos que no se pueden copiar. Revisá sus espacios e intentá de nuevo.",
      };
    }

    return { success: false, message: "Error al duplicar el festival" };
  }
}
