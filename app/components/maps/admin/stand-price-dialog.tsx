"use client";

import { AlertCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/app/components/ui/alert";
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
import { updateStandPricesAction } from "@/app/lib/stands/pricing-actions";

export type PricedStand = {
  id: number;
  label: string | null;
  standNumber: number;
  standCategory: string;
  individualPrice: number;
  sharedPrice: number | null;
};

type StandPriceDialogProps = {
  stands: PricedStand[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lets the editor patch its local copy without a full reload. */
  onSaved?: (
    updates: {
      id: number;
      individualPrice: number;
      sharedPrice: number | null;
    }[],
  ) => void;
};

function standName(stand: PricedStand) {
  return stand.label?.trim() || `#${stand.standNumber}`;
}

/**
 * A field only gets a starting value when every stand it covers already agrees;
 * a mixed selection stays blank so nothing is overwritten by accident.
 */
function commonValue(values: (number | null)[]) {
  if (values.length === 0) return "";
  const [first, ...rest] = values;
  if (rest.some((value) => value !== first)) return "";
  return first === null ? "" : String(first);
}

/**
 * Sets individual and shared prices for one stand or a whole selection.
 *
 * Bulk is not just a shortcut: a declared full table requires both halves to
 * agree, so repricing a paired stand is only possible by editing both at once.
 * The server enforces that, and its refusal is surfaced here in full.
 */
export default function StandPriceDialog({
  stands,
  open,
  onOpenChange,
  onSaved,
}: StandPriceDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [individual, setIndividual] = useState("");
  const [shared, setShared] = useState("");
  const [problems, setProblems] = useState<string[]>([]);

  // The dialog stays mounted between openings, so the fields are seeded here
  // rather than in useState. Blank means "remove the shared price", so an
  // unseeded field would quietly wipe prices the admin never meant to touch.
  const standsRef = useRef(stands);
  standsRef.current = stands;
  useEffect(() => {
    if (!open) return;
    const current = standsRef.current;
    setIndividual(commonValue(current.map((stand) => stand.individualPrice)));
    setShared(
      commonValue(
        current
          .filter((stand) => stand.standCategory === "illustration")
          .map((stand) => stand.sharedPrice),
      ),
    );
    setProblems([]);
  }, [open]);

  const illustrationStands = stands.filter(
    (stand) => stand.standCategory === "illustration",
  );
  const allIllustration =
    stands.length > 0 && illustrationStands.length === stands.length;
  const someIllustration = illustrationStands.length > 0;

  const individualValue = Number(individual);
  const sharedValue = shared.trim() === "" ? null : Number(shared);
  const individualValid =
    individual.trim() !== "" &&
    Number.isFinite(individualValue) &&
    individualValue >= 0 &&
    Math.abs(Math.round(individualValue * 100) / 100 - individualValue) < 1e-9;
  const sharedValid =
    sharedValue === null ||
    (Number.isFinite(sharedValue) &&
      sharedValue >= 0 &&
      Math.abs(Math.round(sharedValue * 100) / 100 - sharedValue) < 1e-9 &&
      sharedValue >= individualValue);
  const canSubmit = individualValid && sharedValid && !isPending;

  function save() {
    setProblems([]);
    startTransition(async () => {
      try {
        const result = await updateStandPricesAction(
          stands.map((stand) => ({
            standId: stand.id,
            individualPrice: individualValue,
            // Only illustration carries a shared price; omit it elsewhere so
            // the server does not reject the batch outright.
            ...(stand.standCategory === "illustration"
              ? { sharedPrice: sharedValue }
              : {}),
          })),
        );
        if (!result.success) {
          toast.error(result.message);
          setProblems(result.problems ?? []);
          return;
        }
        toast.success(result.message);
        onSaved?.(
          stands.map((stand) => ({
            id: stand.id,
            individualPrice: individualValue,
            sharedPrice:
              stand.standCategory === "illustration"
                ? sharedValue
                : stand.sharedPrice,
          })),
        );
        onOpenChange(false);
        router.refresh();
      } catch (error) {
        console.error("Error updating stand prices", error);
        toast.error("Error al actualizar los precios.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {stands.length === 1 ? "Precio del espacio" : "Precios en lote"}
          </DialogTitle>
          <DialogDescription>
            {stands.length === 1
              ? `Espacio ${standName(stands[0])}`
              : `${stands.length} espacios seleccionados`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="stand-individual-price">Precio individual</Label>
            <Input
              id="stand-individual-price"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={individual}
              onChange={(event) => setIndividual(event.target.value)}
              disabled={isPending}
              placeholder="0.00"
            />
            <p className="text-xs text-muted-foreground">
              Total para un participante registrado.
            </p>
            {individual.trim() !== "" && !individualValid && (
              <p className="text-xs text-red-600">
                Ingresá 0 o más, con hasta dos decimales.
              </p>
            )}
          </div>

          {someIllustration && (
            <div className="grid gap-2">
              <Label htmlFor="stand-shared-price">Precio compartido</Label>
              <Input
                id="stand-shared-price"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={shared}
                onChange={(event) => setShared(event.target.value)}
                disabled={isPending}
                placeholder="Dejalo vacío para quitarlo"
              />
              <p className="text-xs text-muted-foreground">
                Total de la reserva con un compañero, no el precio por persona.
                No puede ser menor que el individual.
                {!allIllustration &&
                  " Solo se aplica a los espacios de ilustración de la selección."}
              </p>
              {!sharedValid && (
                <p className="text-xs text-red-600">
                  El precio compartido debe ser 0 o más, con hasta dos
                  decimales, y no menor que el individual.
                </p>
              )}
            </div>
          )}

          {problems.length > 0 && (
            <Alert variant="destructive">
              <AlertCircleIcon className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc space-y-1 pl-4">
                  {problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={save} disabled={!canSubmit}>
            {isPending ? "Guardando..." : "Guardar precios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
