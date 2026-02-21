"use client";

import { useState } from "react";
import { Download, Save } from "lucide-react";
import { toast } from "sonner";
import { useUser } from "@clerk/nextjs";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Textarea } from "@/app/components/ui/textarea";
import {
  exportFestivalMapAsTemplate,
  saveMapTemplate,
} from "@/app/lib/map_templates/actions";
import { MapTemplate } from "@/app/lib/map_templates/definitions";
import { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";

type TemplateExportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  festivalId: number;
  sectors: FestivalSectorWithStandsWithReservationsWithParticipants[];
};

export default function TemplateExportDialog({
  open,
  onOpenChange,
  festivalId,
  sectors,
}: TemplateExportDialogProps) {
  const { user } = useUser();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedSectorIds, setSelectedSectorIds] = useState<Set<number>>(
    new Set(sectors.map((s) => s.id)),
  );
  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const toggleSector = (sectorId: number) => {
    setSelectedSectorIds((prev) => {
      const next = new Set(prev);
      if (next.has(sectorId)) {
        next.delete(sectorId);
      } else {
        next.add(sectorId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedSectorIds(new Set(sectors.map((s) => s.id)));
  };

  const deselectAll = () => {
    setSelectedSectorIds(new Set());
  };

  const exportTemplate = async (): Promise<MapTemplate | null> => {
    const result = await exportFestivalMapAsTemplate(festivalId, {
      sectorIds:
        selectedSectorIds.size === sectors.length
          ? undefined
          : Array.from(selectedSectorIds),
    });

    if (!result.success || !result.template) {
      toast.error(result.message);
      return null;
    }

    // Update metadata with user-provided name and description
    const template: MapTemplate = {
      ...result.template,
      metadata: {
        ...result.template.metadata,
        name: name.trim() || result.template.metadata.name,
        description: description.trim() || undefined,
      },
    };

    return template;
  };

  const handleDownload = async () => {
    if (selectedSectorIds.size === 0) {
      toast.error("Selecciona al menos un sector");
      return;
    }

    setIsExporting(true);
    try {
      const template = await exportTemplate();
      if (!template) return;

      // Download as JSON file
      const blob = new Blob([JSON.stringify(template, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${template.metadata.name.replace(/[^a-zA-Z0-9-_ ]/g, "")}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Plantilla descargada");
      onOpenChange(false);
    } catch (error) {
      console.error("Error downloading template", error);
      toast.error("Error al descargar la plantilla");
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveToLibrary = async () => {
    if (selectedSectorIds.size === 0) {
      toast.error("Selecciona al menos un sector");
      return;
    }

    if (!name.trim()) {
      toast.error("Ingresa un nombre para la plantilla");
      return;
    }

    if (!user?.id) {
      toast.error("Debes iniciar sesión para guardar plantillas");
      return;
    }

    setIsSaving(true);
    try {
      const template = await exportTemplate();
      if (!template) return;

      const result = await saveMapTemplate(template, user.id, festivalId);

      if (result.success) {
        toast.success(result.message);
        onOpenChange(false);
        // Reset form
        setName("");
        setDescription("");
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error("Error saving template", error);
      toast.error("Error al guardar la plantilla");
    } finally {
      setIsSaving(false);
    }
  };

  const totalStands = sectors
    .filter((s) => selectedSectorIds.has(s.id))
    .reduce((acc, s) => acc + s.stands.length, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Exportar plantilla de mapa</DialogTitle>
          <DialogDescription>
            Guarda la configuración del mapa para reutilizarla en otros
            festivales.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="template-name">Nombre de la plantilla</Label>
            <Input
              id="template-name"
              placeholder="Ej: Mapa Festival 2024"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="template-description">
              Descripción (opcional)
            </Label>
            <Textarea
              id="template-description"
              placeholder="Describe el propósito o características de esta plantilla..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>Sectores a incluir</Label>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-primary hover:underline"
                >
                  Todos
                </button>
                <span className="text-muted-foreground">|</span>
                <button
                  type="button"
                  onClick={deselectAll}
                  className="text-primary hover:underline"
                >
                  Ninguno
                </button>
              </div>
            </div>
            <div className="rounded-md border p-3 space-y-2 max-h-40 overflow-y-auto">
              {sectors.map((sector) => (
                <label
                  key={sector.id}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Checkbox
                    checked={selectedSectorIds.has(sector.id)}
                    onCheckedChange={() => toggleSector(sector.id)}
                  />
                  <span className="text-sm flex-1">{sector.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {sector.stands.length} espacios
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedSectorIds.size} sector{selectedSectorIds.size !== 1 && "es"} seleccionado{selectedSectorIds.size !== 1 && "s"} ({totalStands} espacios)
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleDownload}
            disabled={isExporting || isSaving || selectedSectorIds.size === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            {isExporting ? "Descargando..." : "Descargar JSON"}
          </Button>
          <Button
            onClick={handleSaveToLibrary}
            disabled={
              isSaving || isExporting || selectedSectorIds.size === 0 || !name.trim() || !user?.id
            }
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? "Guardando..." : "Guardar en biblioteca"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
