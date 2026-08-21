"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { Button } from "@/app/components/ui/button";
import { Label } from "@/app/components/ui/label";
import { Textarea } from "@/app/components/ui/textarea";
import {
  getStoreCategoryScopeLabel,
  type StoreCategory,
} from "@/app/lib/store/category";
import { Loader2Icon } from "lucide-react";

type HistoricalCategoryCorrectionDialogProps = {
  targetCategory: StoreCategory | null;
  sourceCount: number;
  reason: string;
  isPending: boolean;
  onReasonChange: (reason: string) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export default function HistoricalCategoryCorrectionDialog({
  targetCategory,
  sourceCount,
  reason,
  isPending,
  onReasonChange,
  onOpenChange,
  onConfirm,
}: HistoricalCategoryCorrectionDialogProps) {
  return (
    <AlertDialog
      open={targetCategory != null}
      onOpenChange={(open) => {
        if (!open && !isPending) onOpenChange(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            ¿Marcar {sourceCount}{" "}
            {sourceCount === 1 ? "línea" : "líneas"} como{" "}
            {targetCategory ? getStoreCategoryScopeLabel(targetCategory) : ""}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Solo cambia la categoría histórica de las líneas seleccionadas. No
            modifica precios, costos, stock, cantidades ni el estado del pedido.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="category-correction-reason">
            Motivo de la corrección
          </Label>
          <Textarea
            id="category-correction-reason"
            value={reason}
            maxLength={500}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Ej.: líneas de insumos vendidas antes del lanzamiento del Mercadito."
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <Button
            type="button"
            disabled={isPending || !reason.trim()}
            onClick={onConfirm}
          >
            {isPending && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
            Corregir categoría
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
