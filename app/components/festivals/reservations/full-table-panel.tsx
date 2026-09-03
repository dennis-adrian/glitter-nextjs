"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import BuyFeatureCreditsButton from "@/app/components/credits/buy-feature-credits-button";
import FullTableGraphic from "@/app/components/festivals/reservations/full-table-graphic";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  activateFullTableAccessAction,
  deactivateFullTableAccessAction,
} from "@/app/lib/reservations/full-table-actions";
import { formatCredits } from "@/app/components/credits/credit-amount";

import type { FullTableOffer } from "@/app/lib/reservations/full-table-queries";

/**
 * The pre-booking full-table decision (PRD §7.2).
 *
 * It lives before the map on purpose: the map is for choosing a space, and the
 * PRD forbids any financial setup inside it. A participant who declines here
 * can come back and activate later, right up until they book.
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
   * route from this panel to an activated table, so the whole offer goes rather
   * than quoting a price nobody can pay.
   */
  creditsEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dismissed, setDismissed] = useState(false);

  if (!offer.offered || !creditsEnabled) return null;

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

  const blockedCopy =
    offer.blockedReason === "no_complete_table"
      ? "Ahora mismo no queda ninguna mesa con las dos mitades libres. Volvé a mirar más tarde: puede liberarse alguna."
      : offer.blockedReason === "insufficient_credits"
        ? `Te faltan ${formatCredits(offer.shortfall)} en créditos para activarla.`
        : null;

  return (
    <section
      aria-labelledby="full-table-heading"
      className="mb-6 rounded-lg border bg-card p-4 sm:p-6"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="mx-auto w-full max-w-[260px] shrink-0 sm:mx-0 sm:w-[240px]">
          <FullTableGraphic variant={offer.active ? "full-selected" : "full"} />
        </div>

        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="full-table-heading" className="text-lg font-semibold">
              Mesa completa
            </h2>
            {offer.active ? <Badge variant="secondary">Activada</Badge> : null}
          </div>

          <p className="mt-2 text-sm text-muted-foreground">
            Un espacio es media mesa: 120 × 60 cm. Una mesa completa son dos
            espacios contiguos, 240 × 60 cm, para vos solo.
          </p>

          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Precio:</dt>
              <dd className="font-medium">
                {formatCredits(offer.creditPrice)} en créditos
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Tus créditos:</dt>
              <dd className="font-medium">
                {formatCredits(offer.spendableBalance)}
              </dd>
            </div>
          </dl>

          {/* The most important thing on this screen: what the money buys. */}
          <p className="mt-3 rounded-md bg-muted p-3 text-sm">
            Activarla te habilita a intentar tomar una mesa completa mientras
            haya disponibles. <strong>No reserva ni garantiza</strong> ninguna
            mesa ni ubicación. Si al final tomás un solo espacio, no se te cobra
            y podés usar esos créditos para pagar tu reserva.
          </p>

          {blockedCopy ? (
            <p className="mt-3 text-sm text-muted-foreground">{blockedCopy}</p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {offer.active ? (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => run(deactivateFullTableAccessAction)}
              >
                Desactivar mesa completa
              </Button>
            ) : (
              <Button
                disabled={pending || offer.blockedReason != null}
                onClick={() => run(activateFullTableAccessAction)}
              >
                Activar mesa completa
              </Button>
            )}

            {/* Offered on any shortfall, not only when credits are the sole
                thing missing. `createFeatureCreditTopUp` deliberately sells
                while every table is taken, because credits never expire and
                pay the participant's own reservation if the table never frees
                up — so tying the button to `insufficient_credits` hid it in
                exactly the case where someone still wants to get ready. */}
            {!offer.active && offer.shortfall > 0 ? (
              <BuyFeatureCreditsButton
                festivalId={festivalId}
                featureType="full_table"
                shortfallAmount={offer.shortfall}
                disabled={pending}
              />
            ) : null}

            <Button variant="ghost" asChild>
              <a href="/credits_info">Cómo funcionan los créditos</a>
            </Button>

            {!offer.active && !dismissed ? (
              <Button variant="ghost" onClick={() => setDismissed(true)}>
                Ahora no
              </Button>
            ) : null}
          </div>

          {dismissed && !offer.active ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Seguí eligiendo tu espacio normalmente. Podés volver acá y
              activarla en cualquier momento antes de reservar.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
