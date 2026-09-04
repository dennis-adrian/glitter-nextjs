"use client";

import { XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import BuyFeatureCreditsButton from "@/app/components/credits/buy-feature-credits-button";
import { Button } from "@/app/components/ui/button";
import {
  dismissFullTableBanner,
  isFullTableBannerDismissed,
} from "@/app/components/festivals/reservations/full-table-dismissal";
import {
  activateFullTableAccessAction,
  deactivateFullTableAccessAction,
} from "@/app/lib/reservations/full-table-actions";
import { formatCreditCount } from "@/app/components/credits/credit-amount";

import type { FullTableOffer } from "@/app/lib/reservations/full-table-queries";

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
   * quoting a price nobody can pay. An already-activated table is the
   * exception — see the guard below.
   */
  creditsEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hidden, setHidden] = useState(false);

  // Read after mount: the server has no way to know what this browser dismissed,
  // and reading during render would make the markup disagree with hydration.
  useEffect(() => {
    setHidden(isFullTableBannerDismissed(festivalId));
  }, [festivalId]);

  if (!offer.offered) return null;

  // Everything below only silences a pitch. Once the table is activated the
  // panel stops being one: those are the participant's credits on hold, and
  // Desactivar is the only way to get them back (PRD §7.3). Neither turning the
  // flag back off nor a dismissal from before activation may take that away.
  if (!offer.active && (!creditsEnabled || hidden)) return null;

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
    dismissFullTableBanner(festivalId);
  }

  // One clause after the name, never a second paragraph — this is a banner.
  // There is no blocked variant to word: an offer with no free table is not
  // offered at all, and missing credits is what the button itself is for.
  const detail = offer.active
    ? "activada"
    : `240 × 60 cm, el doble de un stand regular, por ${formatCreditCount(offer.creditPrice)}`;

  return (
    <section
      aria-labelledby="full-table-heading"
      className={`relative mb-4 rounded-lg border bg-card py-2 pl-3 text-sm ${
        offer.active ? "pr-3" : "pr-10"
      }`}
    >
      {/* Dismissing is the point: this is an offer the participant has already
          been shown a screen of its own, and they came here to pick a space.
          Pinned to the corner, where a banner's close control belongs, so it
          never competes with the offer's own buttons for the row. Gone once the
          table is activated: a control that comes back on the next render only
          reads as broken, and the panel has to stay reachable for Desactivar. */}
      {!offer.active && (
        <Button
          variant="ghost"
          size="sm"
          className="absolute right-1 top-1 h-7 w-7 p-0"
          aria-label="Ocultar el aviso de mesa completa"
          onClick={dismiss}
        >
          <XIcon className="h-4 w-4" />
        </Button>
      )}

      {/* Stacked until there is room for one line. Side by side on a phone the
          sentence gets squeezed to a word per line while the button keeps its
          width, which is the opposite of what a one-line banner is for. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <p id="full-table-heading" className="min-w-0">
          <span className="font-medium">Mesa completa</span>{" "}
          <span className="text-muted-foreground">· {detail}</span>
        </p>

        <div className="flex shrink-0 items-center justify-center gap-2 sm:justify-start">
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
              size="sm"
            />
          ) : (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run(activateFullTableAccessAction)}
            >
              Activar
            </Button>
          )}

          <Button variant="ghost" size="sm" asChild>
            <a href="/credits_info">Qué es</a>
          </Button>
        </div>
      </div>
    </section>
  );
}
