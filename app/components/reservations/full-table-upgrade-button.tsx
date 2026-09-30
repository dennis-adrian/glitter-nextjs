"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { describeFullTableUpgrade } from "@/app/components/reservations/full-table-upgrade-options";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { Button } from "@/app/components/ui/button";
import { upgradeFullTableReservationAction } from "@/app/lib/reservations/full-table-actions";
import type { FullTableUpgradePreview } from "@/app/lib/reservations/full-table-upgrade-queries";

/**
 * Widens a half-table reservation to the full table its stand belongs to
 * (PRD-admin-stand-management, Feature D).
 *
 * The inverse of the downgrade, but not its mirror: it can reopen a paid
 * reservation for a balance or hand credits back, so the dialog states the
 * actual amounts from the preview. The server recomputes them under its locks
 * and refuses if they moved, so what the admin reads here is what gets applied.
 */
export default function FullTableUpgradeButton({
  reservationId,
  preview,
  disabledReason,
}: {
  reservationId: number;
  preview: FullTableUpgradePreview;
  /**
   * Why this viewer cannot upgrade, when they cannot. Set it and the button
   * stays visible but inert: a festival admin, or a table that cannot take the
   * reservation, should read as restricted rather than missing.
   */
  disabledReason?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // Held across retries, not minted per submit. A request whose response is
  // lost has still been claimed by the registry: retrying with the same key
  // replays its result, while a fresh key would report a failure for an upgrade
  // that in fact succeeded. Only an explicit refusal earns a new one.
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

  const { plan, expected, companion } = preview;
  const inert = disabledReason != null || !plan || !expected || !companion;

  function confirm() {
    if (!expected) return;
    startTransition(async () => {
      let result;
      try {
        result = await upgradeFullTableReservationAction({
          reservationId,
          idempotencyKey,
          expected,
        });
      } catch (error) {
        console.error("Error upgrading to full table", error);
        toast.error("No se pudo ampliar la reserva. Intentá nuevamente.");
        return;
      }

      if (!result.success) {
        // The amounts in this dialog came from the page render, and a refusal
        // is the server saying something moved. Closing and re-reading the
        // page means the next confirmation is made against current numbers,
        // never the ones that were just refused.
        toast.error(
          result.code === "FULL_TABLE_UPGRADE_STALE"
            ? "El monto cambió desde que abriste el diálogo. Abrilo de nuevo para ver los montos actualizados."
            : result.message,
        );
        setIdempotencyKey(crypto.randomUUID());
        setOpen(false);
        router.refresh();
        return;
      }

      toast.success(result.message);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={inert}
        title={disabledReason ?? undefined}
        onClick={() => setOpen(true)}
      >
        Ampliar a mesa completa
      </Button>
      {disabledReason && (
        <p className="mt-2 text-xs text-muted-foreground">{disabledReason}</p>
      )}

      {plan && companion ? (
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Ampliar a mesa completa?</AlertDialogTitle>
              {/* Concrete amounts rather than the stand switch's general
                  rules: the preview already knows them, and a balance that
                  reopens a paid reservation should never be a surprise. */}
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-left">
                  {describeFullTableUpgrade({
                    plan,
                    reservationStatus: preview.reservationStatus,
                    keptStandLabel: preview.keptStand.label,
                    companionStandLabel: companion.label,
                    hasOwner: preview.hasOwner,
                    hasTender: preview.hasTender,
                  }).map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  // Radix closes on click; the transition needs the dialog to
                  // stay up until the action answers.
                  event.preventDefault();
                  confirm();
                }}
                disabled={pending}
              >
                {pending ? "Ampliando…" : "Ampliar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}
