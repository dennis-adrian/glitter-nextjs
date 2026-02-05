"use client";

import { useEffect, useRef, useState } from "react";
import { FileUp, Library, Upload, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Label } from "@/app/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/app/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/app/components/ui/radio-group";
import {
  fetchMapTemplates,
  importTemplateToFestival,
} from "@/app/lib/map_templates/actions";
import { mapTemplateSchema } from "@/app/lib/map_templates/schemas";
import {
  MapTemplate,
  MapTemplateRecord,
} from "@/app/lib/map_templates/definitions";
import { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";

type TemplateImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  festivalId: number;
  sectors: FestivalSectorWithStandsWithReservationsWithParticipants[];
  onImportSuccess: () => void;
};

export default function TemplateImportDialog({
  open,
  onOpenChange,
  festivalId,
  sectors,
  onImportSuccess,
}: TemplateImportDialogProps) {
  const [activeTab, setActiveTab] = useState<"library" | "upload">("library");
  const [templates, setTemplates] = useState<MapTemplateRecord[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [uploadedTemplate, setUploadedTemplate] = useState<MapTemplate | null>(
    null,
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<"replace" | "create_only">(
    "create_only",
  );
  const [targetSectorId, setTargetSectorId] = useState<string>("all");
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load templates when dialog opens
  useEffect(() => {
    if (open && activeTab === "library") {
      loadTemplates();
    }
  }, [open, activeTab]);

  const loadTemplates = async () => {
    setIsLoadingTemplates(true);
    try {
      const result = await fetchMapTemplates();
      setTemplates(result);
    } catch (error) {
      console.error("Error loading templates", error);
      toast.error("Error al cargar las plantillas");
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setUploadedTemplate(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const json = JSON.parse(content);
        const parsed = mapTemplateSchema.parse(json);
        setUploadedTemplate(parsed);
      } catch (error) {
        console.error("Error parsing template file", error);
        if (error instanceof SyntaxError) {
          setUploadError("El archivo no es un JSON válido");
        } else {
          setUploadError("El archivo no tiene el formato de plantilla correcto");
        }
      }
    };
    reader.onerror = () => {
      setUploadError("Error al leer el archivo");
    };
    reader.readAsText(file);
  };

  const getSelectedTemplate = (): MapTemplate | null => {
    if (activeTab === "upload") {
      return uploadedTemplate;
    }
    const selected = templates.find(
      (t) => t.id === Number(selectedTemplateId),
    );
    return selected?.templateData ?? null;
  };

  const handleImport = async () => {
    const template = getSelectedTemplate();
    if (!template) {
      toast.error("Selecciona una plantilla");
      return;
    }

    setIsImporting(true);
    try {
      const result = await importTemplateToFestival(festivalId, template, {
        mode: importMode,
        targetSectorId:
          targetSectorId === "all" ? undefined : Number(targetSectorId),
      });

      if (result.success) {
        toast.success(result.message);
        onOpenChange(false);
        onImportSuccess();
        // Reset state
        setSelectedTemplateId("");
        setUploadedTemplate(null);
        setImportMode("create_only");
        setTargetSectorId("all");
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error("Error importing template", error);
      toast.error("Error al importar la plantilla");
    } finally {
      setIsImporting(false);
    }
  };

  const selectedTemplate = getSelectedTemplate();
  const hasExistingStands = sectors.some((s) => s.stands.length > 0);

  const getTotalStandsInTemplate = () => {
    if (!selectedTemplate) return 0;
    if (targetSectorId !== "all") {
      return selectedTemplate.sectors[0]?.stands.length ?? 0;
    }
    return selectedTemplate.sectors.reduce(
      (acc, s) => acc + s.stands.length,
      0,
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar plantilla de mapa</DialogTitle>
          <DialogDescription>
            Aplica una plantilla guardada o carga un archivo JSON.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "library" | "upload")}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="library">
              <Library className="h-4 w-4 mr-2" />
              Biblioteca
            </TabsTrigger>
            <TabsTrigger value="upload">
              <FileUp className="h-4 w-4 mr-2" />
              Subir archivo
            </TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="mt-4">
            {isLoadingTemplates ? (
              <div className="text-center py-8 text-muted-foreground">
                Cargando plantillas...
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No hay plantillas guardadas. Exporta un mapa primero.
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {templates.map((template) => (
                  <label
                    key={template.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedTemplateId === String(template.id)
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="template"
                      value={template.id}
                      checked={selectedTemplateId === String(template.id)}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {template.name}
                      </p>
                      {template.description && (
                        <p className="text-xs text-muted-foreground truncate">
                          {template.description}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {template.templateData.sectors.length} sector
                        {template.templateData.sectors.length !== 1 && "es"} •{" "}
                        {template.templateData.sectors.reduce(
                          (acc, s) => acc + s.stands.length,
                          0,
                        )}{" "}
                        espacios
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="upload" className="mt-4">
            <div className="space-y-4">
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Arrastra un archivo JSON o haz clic para seleccionar
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

              {uploadedTemplate && (
                <div className="p-3 rounded-lg border bg-muted/50">
                  <p className="font-medium text-sm">
                    {uploadedTemplate.metadata.name}
                  </p>
                  {uploadedTemplate.metadata.description && (
                    <p className="text-xs text-muted-foreground">
                      {uploadedTemplate.metadata.description}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {uploadedTemplate.sectors.length} sector
                    {uploadedTemplate.sectors.length !== 1 && "es"} •{" "}
                    {uploadedTemplate.sectors.reduce(
                      (acc, s) => acc + s.stands.length,
                      0,
                    )}{" "}
                    espacios
                  </p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {selectedTemplate && (
          <div className="space-y-4 pt-2 border-t">
            <div className="grid gap-2">
              <Label>Sector destino</Label>
              <Select value={targetSectorId} onValueChange={setTargetSectorId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    Todos los sectores ({sectors.length})
                  </SelectItem>
                  {sectors.map((sector) => (
                    <SelectItem key={sector.id} value={String(sector.id)}>
                      {sector.name} ({sector.stands.length} espacios actuales)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {targetSectorId !== "all" &&
                selectedTemplate.sectors.length > 1 && (
                  <p className="text-xs text-muted-foreground">
                    Solo se importará el primer sector de la plantilla
                  </p>
                )}
            </div>

            <div className="grid gap-2">
              <Label>Modo de importación</Label>
              <RadioGroup
                value={importMode}
                onValueChange={(v) =>
                  setImportMode(v as "replace" | "create_only")
                }
              >
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="create_only" />
                  <span className="text-sm">
                    Solo si está vacío
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

            {hasExistingStands && importMode === "create_only" && (
              <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  El festival ya tiene espacios configurados. Selecciona
                  "Reemplazar existentes" o elige un sector vacío.
                </span>
              </div>
            )}

            <div className="text-sm text-muted-foreground space-y-1">
              {targetSectorId === "all" && selectedTemplate && (
                <p>
                  Se configurarán <strong>{selectedTemplate.sectors.length}</strong>{" "}
                  sector{selectedTemplate.sectors.length !== 1 && "es"} con{" "}
                  <strong>{getTotalStandsInTemplate()}</strong> espacios en total.
                  {importMode === "replace" &&
                    sectors.length !== selectedTemplate.sectors.length && (
                      <span>
                        {" "}
                        Los sectores del festival se ajustarán para coincidir con
                        la plantilla.
                      </span>
                    )}
                </p>
              )}
              {targetSectorId !== "all" && (
                <p>
                  Se crearán <strong>{getTotalStandsInTemplate()}</strong>{" "}
                  espacios en el sector seleccionado.
                </p>
              )}
              <p>
                Los espacios importados tendrán estado{" "}
                <strong>disponible</strong>.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleImport}
            disabled={!selectedTemplate || isImporting}
          >
            {isImporting ? "Importando..." : "Importar plantilla"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
