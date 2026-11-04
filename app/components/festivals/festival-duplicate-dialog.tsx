"use client";

import { CopyIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { duplicateFestival } from "@/app/lib/festival_exports/actions";

type FestivalDuplicateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  festivalId: number;
  festivalName: string;
};

/** Exporting and importing a festival, in one step. */
export default function FestivalDuplicateDialog({
  open,
  onOpenChange,
  festivalId,
  festivalName,
}: FestivalDuplicateDialogProps) {
  const router = useRouter();
  const [name, setName] = useState(`${festivalName} (copia)`);
  const [pending, setPending] = useState(false);

  const handleDuplicate = async () => {
    setPending(true);
    try {
      const result = await duplicateFestival({ festivalId, name: name.trim() });
      if (result.success && result.festivalId) {
        toast.success(result.message);
        onOpenChange(false);
        router.push(`/dashboard/festivals/${result.festivalId}`);
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error("Error al duplicar el festival");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Duplicar festival</DialogTitle>
          <DialogDescription>
            Crea un festival nuevo en borrador con la misma configuración que{" "}
            <strong>{festivalName}</strong>. Es lo mismo que exportarlo e
            importarlo, en un solo paso.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="duplicate-festival-name">Nombre del festival</Label>
            <Input
              id="duplicate-festival-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
            />
          </div>

          <div className="grid gap-1 text-sm">
            <p className="font-medium">Se copia</p>
            <p className="text-muted-foreground">
              Información básica, fechas, tiempo de bloqueo de reservas,
              funciones de reserva con sus precios en créditos, sectores,
              elementos del mapa y espacios con sus precios individual y
              compartido, subcategorías y mesas completas (con su precio).
            </p>
          </div>
          <div className="grid gap-1 text-sm">
            <p className="font-medium">No se copia</p>
            <p className="text-muted-foreground">
              Reservas, participantes, imágenes y la acreditación: el festival
              nuevo empieza en borrador, con todos los espacios disponibles.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => void handleDuplicate()}
            disabled={pending || name.trim() === ""}
          >
            <CopyIcon className="mr-2 h-4 w-4" />
            {pending ? "Duplicando…" : "Duplicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
