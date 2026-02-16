"use client";

import { useRef, useState } from "react";
import { Upload, AlertCircle, FileUp } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Checkbox } from "@/app/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/app/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { festivalExportSchema } from "@/app/lib/festival_exports/schemas";
import { mapTemplateSchema } from "@/app/lib/map_templates/schemas";
import { FestivalExport } from "@/app/lib/festival_exports/definitions";
import { MapTemplate } from "@/app/lib/map_templates/definitions";
import {
  importFestivalData,
  createFestivalFromImport,
} from "@/app/lib/festival_exports/actions";

type FestivalImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
} & (
  | { mode: "existing"; festivalId: number; festivalName: string }
  | { mode: "create" }
);

type ParsedFile =
  | { type: "v2"; data: FestivalExport }
  | { type: "legacy"; data: MapTemplate };

export default function FestivalImportDialog(props: FestivalImportDialogProps) {
  const { open, onOpenChange } = props;
  const router = useRouter();

  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [festivalName, setFestivalName] = useState(
    props.mode === "existing" ? props.festivalName : "",
  );
  const [importBasicInfo, setImportBasicInfo] = useState(true);
  const [importSectors, setImportSectors] = useState(true);
  const [sectorImportMode, setSectorImportMode] = useState<
    "replace" | "create_only"
  >("create_only");
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLegacy = parsedFile?.type === "legacy";
  const hasBasicInfo =
    parsedFile?.type === "v2" && !!parsedFile.data.festival;
  const hasSectors =
    parsedFile?.type === "v2"
      ? !!parsedFile.data.sectors
      : parsedFile?.type === "legacy";
  const isCreateMode = props.mode === "create";

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setParsedFile(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const json = JSON.parse(content);

        // Try v2.0 format first
        const v2Result = festivalExportSchema.safeParse(json);
        if (v2Result.success) {
          setParsedFile({ type: "v2", data: v2Result.data as FestivalExport });
          // Pre-select import options based on what the file contains
          setImportBasicInfo(!!v2Result.data.festival);
          setImportSectors(!!v2Result.data.sectors);
          // Pre-fill name in create mode from file data
          if (isCreateMode) {
            setFestivalName(
              v2Result.data.festival?.name ?? v2Result.data.metadata.name,
            );
          }
          return;
        }

        // Try legacy map template format
        const legacyResult = mapTemplateSchema.safeParse(json);
        if (legacyResult.success) {
          setParsedFile({
            type: "legacy",
            data: legacyResult.data as MapTemplate,
          });
          setImportBasicInfo(false);
          setImportSectors(true);
          // Pre-fill name in create mode from file data
          if (isCreateMode) {
            setFestivalName(legacyResult.data.metadata.name);
          }
          return;
        }

        setUploadError(
          "El archivo no tiene un formato reconocido. Debe ser un archivo de exportacion de festival o una plantilla de mapa.",
        );
      } catch (error) {
        console.error("Error parsing file", error);
        if (error instanceof SyntaxError) {
          setUploadError("El archivo no es un JSON valido");
        } else {
          setUploadError("Error al leer el archivo");
        }
      }
    };
    reader.onerror = () => {
      setUploadError("Error al leer el archivo");
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!parsedFile) return;

    setIsImporting(true);
    try {
      if (isCreateMode) {
        // Create new festival mode
        let exportData: FestivalExport;

        if (parsedFile.type === "v2") {
          exportData = parsedFile.data;
        } else {
          // Convert legacy format to v2 for creation
          exportData = {
            version: "2.0",
            metadata: {
              name: parsedFile.data.metadata.name,
              createdAt: parsedFile.data.metadata.createdAt,
              createdFrom: parsedFile.data.metadata.createdFrom,
            },
            sectors: parsedFile.data.sectors,
          };
        }

        const result = await createFestivalFromImport(
          exportData,
          festivalName.trim(),
        );

        if (result.success && result.festivalId) {
          toast.success(result.message);
          onOpenChange(false);
          resetState();
          router.push(`/dashboard/festivals/${result.festivalId}`);
        } else {
          toast.error(result.message);
        }
      } else {
        // Import into existing festival mode
        const festivalId = props.festivalId;

        if (parsedFile.type === "v2") {
          const result = await importFestivalData(
            festivalId,
            parsedFile.data,
            {
              importBasicInfo,
              importSectors,
              sectorImportMode,
              nameOverride: importBasicInfo
                ? festivalName.trim()
                : undefined,
            },
          );

          if (result.success) {
            const details = result.details;
            const parts: string[] = [];
            if (details?.basicInfoUpdated) parts.push("informacion basica");
            if (details?.sectorsCreated)
              parts.push(
                `${details.sectorsCreated} sector${details.sectorsCreated !== 1 ? "es" : ""}`,
              );
            if (details?.standsCreated)
              parts.push(`${details.standsCreated} espacio${details.standsCreated !== 1 ? "s" : ""}`);

            toast.success(
              parts.length > 0
                ? `Importado: ${parts.join(", ")}`
                : result.message,
            );
            onOpenChange(false);
            resetState();
            router.refresh();
          } else {
            toast.error(result.message);
          }
        } else {
          // Legacy format - convert to v2 and import sectors only
          const exportData: FestivalExport = {
            version: "2.0",
            metadata: {
              name: parsedFile.data.metadata.name,
              createdAt: parsedFile.data.metadata.createdAt,
              createdFrom: parsedFile.data.metadata.createdFrom,
            },
            sectors: parsedFile.data.sectors,
          };

          const result = await importFestivalData(festivalId, exportData, {
            importBasicInfo: false,
            importSectors: true,
            sectorImportMode,
          });

          if (result.success) {
            toast.success(result.message);
            onOpenChange(false);
            resetState();
            router.refresh();
          } else {
            toast.error(result.message);
          }
        }
      }
    } catch (error) {
      console.error("Error importing data", error);
      toast.error("Error al importar los datos");
    } finally {
      setIsImporting(false);
    }
  };

  const resetState = () => {
    setParsedFile(null);
    setUploadError(null);
    setFestivalName(props.mode === "existing" ? props.festivalName : "");
    setImportBasicInfo(true);
    setImportSectors(true);
    setSectorImportMode("create_only");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const getPreviewInfo = () => {
    if (!parsedFile) return null;

    if (parsedFile.type === "v2") {
      const { festival, sectors } = parsedFile.data;
      return {
        name: parsedFile.data.metadata.name,
        festivalName: festival?.name,
        festivalType: festival?.festivalType,
        datesCount: festival?.dates.length ?? 0,
        sectorsCount: sectors?.length ?? 0,
        standsCount:
          sectors?.reduce((acc, s) => acc + s.stands.length, 0) ?? 0,
        hasBasicInfo: !!festival,
        hasSectors: !!sectors,
      };
    }

    // Legacy format
    return {
      name: parsedFile.data.metadata.name,
      festivalName: undefined,
      festivalType: undefined,
      datesCount: 0,
      sectorsCount: parsedFile.data.sectors.length,
      standsCount: parsedFile.data.sectors.reduce(
        (acc, s) => acc + s.stands.length,
        0,
      ),
      hasBasicInfo: false,
      hasSectors: true,
    };
  };

  const preview = getPreviewInfo();
  const showNameInput = isCreateMode || (importBasicInfo && hasBasicInfo);
  const canImport =
    parsedFile &&
    (isCreateMode || importBasicInfo || importSectors) &&
    (!showNameInput || festivalName.trim().length > 0) &&
    !isImporting;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) resetState();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isCreateMode
              ? "Importar nuevo festival"
              : "Importar datos del festival"}
          </DialogTitle>
          <DialogDescription>
            {isCreateMode
              ? "Crea un nuevo festival a partir de un archivo de exportacion."
              : "Importa datos desde un archivo de exportacion o plantilla de mapa."}
          </DialogDescription>
        </DialogHeader>

        {/* File upload zone */}
        <div className="space-y-4">
          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Haz clic para seleccionar un archivo JSON
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Soporta exportaciones de festival (v2.0) y plantillas de mapa
              (v1.x)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          {uploadError && (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          {/* Preview panel */}
          {preview && (
            <div className="p-3 rounded-lg border bg-muted/50 space-y-1">
              <p className="font-medium text-sm">{preview.name}</p>
              {isLegacy && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Formato de plantilla de mapa (v1.x) - solo se pueden importar
                  sectores
                </p>
              )}
              {preview.hasBasicInfo && (
                <p className="text-xs text-muted-foreground">
                  Festival: {preview.festivalName}
                  {preview.festivalType
                    ? ` (${preview.festivalType})`
                    : ""}
                  {preview.datesCount > 0
                    ? ` - ${preview.datesCount} fecha${preview.datesCount !== 1 ? "s" : ""}`
                    : ""}
                </p>
              )}
              {preview.hasSectors && (
                <p className="text-xs text-muted-foreground">
                  {preview.sectorsCount} sector
                  {preview.sectorsCount !== 1 ? "es" : ""} -{" "}
                  {preview.standsCount} espacio
                  {preview.standsCount !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Import options - only for existing festival mode */}
        {parsedFile && !isCreateMode && (
          <div className="space-y-4 pt-2 border-t">
            <div className="grid gap-2">
              <Label>Que datos importar</Label>
              <div className="space-y-2">
                <label
                  className={`flex items-center gap-2 ${!hasBasicInfo ? "opacity-50" : "cursor-pointer"}`}
                >
                  <Checkbox
                    checked={importBasicInfo}
                    onCheckedChange={(checked) =>
                      setImportBasicInfo(!!checked)
                    }
                    disabled={!hasBasicInfo}
                  />
                  <span className="text-sm">
                    Informacion basica
                    <span className="text-muted-foreground ml-1">
                      (nombre, fechas, tipo, etc.)
                    </span>
                  </span>
                </label>
                <label
                  className={`flex items-center gap-2 ${!hasSectors ? "opacity-50" : "cursor-pointer"}`}
                >
                  <Checkbox
                    checked={importSectors}
                    onCheckedChange={(checked) =>
                      setImportSectors(!!checked)
                    }
                    disabled={!hasSectors}
                  />
                  <span className="text-sm">
                    Sectores y espacios
                  </span>
                </label>
              </div>
            </div>

            {importBasicInfo && hasBasicInfo && (
              <>
                <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Esto sobrescribira la informacion basica del festival
                    actual (nombre, fechas, descripcion, etc.)
                  </span>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="festival-name-existing">
                    Nombre del festival
                  </Label>
                  <Input
                    id="festival-name-existing"
                    placeholder="Ej: Glitter 9na Edicion"
                    value={festivalName}
                    onChange={(e) => setFestivalName(e.target.value)}
                  />
                </div>
              </>
            )}

            {importSectors && hasSectors && (
              <div className="grid gap-2">
                <Label>Modo de importacion de sectores</Label>
                <RadioGroup
                  value={sectorImportMode}
                  onValueChange={(v) =>
                    setSectorImportMode(v as "replace" | "create_only")
                  }
                >
                  <label className="flex items-center gap-2 cursor-pointer">
                    <RadioGroupItem value="create_only" />
                    <span className="text-sm">
                      Solo si esta vacio
                      <span className="text-muted-foreground ml-1">
                        (no reemplazar espacios existentes)
                      </span>
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <RadioGroupItem value="replace" />
                    <span className="text-sm">
                      Reemplazar existentes
                      <span className="text-muted-foreground ml-1">
                        (elimina espacios y ajusta sectores)
                      </span>
                    </span>
                  </label>
                </RadioGroup>
              </div>
            )}
          </div>
        )}

        {/* Create mode options */}
        {parsedFile && isCreateMode && (
          <div className="space-y-4 pt-2 border-t">
            <div className="grid gap-2">
              <Label htmlFor="festival-name">Nombre del festival</Label>
              <Input
                id="festival-name"
                placeholder="Ej: Glitter 9na Edicion"
                value={festivalName}
                onChange={(e) => setFestivalName(e.target.value)}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Se creara un nuevo festival con estado <strong>borrador</strong>
              {preview?.hasBasicInfo && (
                <> con la informacion basica del archivo</>
              )}
              {preview?.hasSectors && (
                <>
                  {preview.hasBasicInfo ? " y" : " con"}{" "}
                  {preview.sectorsCount} sector
                  {preview.sectorsCount !== 1 ? "es" : ""} (
                  {preview.standsCount} espacio
                  {preview.standsCount !== 1 ? "s" : ""})
                </>
              )}
              .
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleImport} disabled={!canImport}>
            <FileUp className="h-4 w-4 mr-2" />
            {isImporting
              ? "Importando..."
              : isCreateMode
                ? "Crear festival"
                : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
