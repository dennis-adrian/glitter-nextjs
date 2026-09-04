"use client";

import { XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import BuyFeatureCreditsButton from "@/app/components/credits/buy-feature-credits-button";
import { Button } from "@/app/components/ui/button";
import {
  activateFullTableAccessAction,
  deactivateFullTableAccessAction,
} from "@/app/lib/reservations/full-table-actions";
import { formatCredits } from "@/app/components/credits/credit-amount";

import type { FullTableOffer } from "@/app/lib/reservations/full-table-queries";

/** Remembered per festival, so a dismissal survives the reload after a hold. */
function dismissalKey(festivalId: number) {
  return `glitter:full-table-banner-dismissed:${festivalId}`;
}

/**
 * The full-table offer, as one dismissible line.
 *
 * It sits above the map and above the countdown, never in front of them: the
 * pitch belongs to the introduction screen after the terms (PRD §7.2), and by
 * the time someone reaches the map they came to pick a space. It stays an
 * offer, not an explainer — what a full table is lives behind the link.
 */
export default function FullTablePanel({
  offer,
  festivalId,
  creditsEnabled,
}: {
  offer: FullTableOffer;
  festivalId: number;
  /**
   * Whether credits are revealed to participants at all.
   *
   * A full table is only ever paid for in credits, and a purchase can only be
   * finished in the wallet. With credits still behind their flag there is no
   * route from here to an activated table, so the whole offer goes rather than
   * quoting a price nobody can pay.
   */
  creditsEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hidden, setHidden] = useState(false);

  // Read after mount: the server has no way to know what this browser dismissed,
  // and reading during render would make the markup disagree with hydration.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(dismissalKey(festivalId)) === "1") {
        setHidden(true);
      }
    } catch {
      // A browser refusing storage just means the banner comes back.
    }
  }, [festivalId]);

  if (!offer.offered || !creditsEnabled || hidden) return null;

  function run(action: typeof activateFullTableAccessAction) {
    startTransition(async () => {
      const result = await action({
        festivalId,
        idempotencyKey: crypto.randomUUID(),
      });
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else toast.error(result.message);
    });
  }

  function dismiss() {
    setHidden(true);
    try {
      window.localStorage.setItem(dismissalKey(festivalId), "1");
    } catch {
      // Nothing to do: it reappears next visit, which is the safe direction.
    }
  }

  const blockedCopy =
    offer.blockedReason === "no_complete_table"
      ? "Ahora mismo no queda ninguna con las dos mitades libres."
      : null;

  return (
    <section
      aria-labelledby="full-table-heading"
      className="mb-4 rounded-lg border bg-card px-3 py-2 text-sm"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p id="full-table-heading" className="flex-1">
          <span className="font-medium">Mesa completa</span>{" "}
          <span className="text-muted-foreground">
            {offer.active
              ? "· ya la tenés activada"
              : `· 240 × 60 cm para vos solo, por ${formatCredits(offer.creditPrice)} en créditos`}
          </span>
        </p>

        {offer.active ? (
          // Activation holds credits, so there has to be a way back out of it
          // wherever activation itself is offered (PRD §7.3).
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => run(deactivateFullTableAccessAction)}
          >
            Desactivar
          </Button>
        ) : offer.shortfall > 0 ? (
          <BuyFeatureCreditsButton
            festivalId={festivalId}
            featureType="full_table"
            shortfallAmount={offer.shortfall}
            disabled={pending}
          />
        ) : (
          <Button
            size="sm"
            disabled={pending || offer.blockedReason != null}
            onClick={() => run(activateFullTableAccessAction)}
          >
            Activar
          </Button>
        )}

        <Button variant="ghost" size="sm" asChild>
          <a href="/credits_info">Qué es</a>
        </Button>

        {/* Dismissing is the point: this is an offer the participant has
            already been shown a screen of its own, and they came here to pick
            a space. */}
        <Button
          variant="ghost"
          size="sm"
          aria-label="Ocultar el aviso de mesa completa"
          onClick={dismiss}
        >
          <XIcon className="h-4 w-4" />
        </Button>
      </div>

      {/* A condition of the purchase rather than a description of it, so it
          stays wherever activation is offered — kept to one clause. */}
      {!offer.active && (
        <p className="text-xs text-muted-foreground">
          {blockedCopy ?? "No reserva ni garantiza ninguna mesa ni ubicación."}
        </p>
      )}
    </section>
  );
}
