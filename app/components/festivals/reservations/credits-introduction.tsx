import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import BuyFeatureCreditsButton from "@/app/components/credits/buy-feature-credits-button";
import { formatCreditCount } from "@/app/components/credits/credit-amount";
import Title from "@/app/components/atoms/heading";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { isFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { isFullTableCategory } from "@/app/lib/reservations/full-table-access";
import { fetchFullTableOffer } from "@/app/lib/reservations/full-table-queries";
import { fetchSelfServiceTargetProfile } from "@/app/lib/reservations/map-queries";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";

type CreditsIntroductionProps = {
  profileId: number;
  festivalId: number;
};

/**
 * The screen a participant lands on right after accepting the terms (PRD §7.2).
 *
 * It exists because the full-table decision is a money decision, and the PRD
 * puts money decisions before the map on purpose — the map is high-friction and
 * timed, and nobody should be reading about credits for the first time while a
 * hold counts down. Nothing here commits anything: it explains what credits are,
 * what a full table costs, and what activating one does and does not buy.
 *
 * It steps aside entirely when there is nothing to introduce — a category that
 * cannot use the feature, a festival that has not configured it, or credits
 * still behind their flag — rather than showing a page about a price that does
 * not exist.
 */
export default async function CreditsIntroduction({
  profileId,
  festivalId,
}: CreditsIntroductionProps) {
  const currentProfile = await getCurrentUserProfile();
  await protectRoute(currentProfile || undefined, profileId);

  const mapHref = `/profiles/${profileId}/festivals/${festivalId}/reservations/new`;

  const forProfile = await fetchSelfServiceTargetProfile(profileId, festivalId);
  if (!forProfile) notFound();

  if (!isFullTableCategory(forProfile.category)) redirect(mapHref);

  // The same offer the panel uses, so this screen cannot quote a price for a
  // festival that has no full tables to sell.
  const [creditsEnabled, offer] = await Promise.all([
    isFeatureEnabled("credits"),
    fetchFullTableOffer({
      userId: forProfile.id,
      festivalId,
      category: forProfile.category,
    }),
  ]);
  if (!creditsEnabled || !offer.offered) redirect(mapHref);

  // The purchase spends the session's own credits, so it is only ever offered
  // to the participant themselves — an admin looking at someone else's
  // enrolment still sees the explanation.
  const canBuy =
    currentProfile?.id === forProfile.id &&
    !offer.active &&
    offer.shortfall > 0;

  return (
    <div className="container max-w-[560px] p-4 md:p-6">
      <div className="mb-4 flex flex-col gap-1 md:gap-2">
        <Title>¿Te gustaría reservar una mesa completa?</Title>
        <p className="text-sm leading-tight text-muted-foreground md:text-base">
          Antes de pasar al mapa de reservas, podés activar la opción de
          reservar una mesa completa con créditos.
        </p>
      </div>

      <div className="space-y-6">
        {/* One number, which is the only thing this screen has to answer: what
            it costs to turn the feature on. What a full table is belongs behind
            the link, not in front of someone deciding whether to pay. */}
        <Card>
          <CardContent className="space-y-4 pt-6">
            <dl className="space-y-1">
              <dt className="text-sm text-muted-foreground">
                Activar la reserva de mesa completa tiene un costo de
              </dt>
              {/* Counted, not priced: this screen is buying credits, so the Bs
                  equivalence belongs to the wallet rather than here. */}
              <dd className="text-3xl font-semibold tabular-nums">
                {formatCreditCount(offer.creditPrice)}
              </dd>
            </dl>

            {/*<p className="text-sm text-muted-foreground">
              {offer.active
                ? "Ya la tenés activada."
                : offer.shortfall > 0
                  ? `Tenés ${formatCredits(offer.spendableBalance)}, así que te faltan ${formatCredits(offer.shortfall)}.`
                  : `Tenés ${formatCredits(offer.spendableBalance)}, así que ya te alcanza.`}
            </p>*/}

            {/* A condition of the purchase, not an explanation of the product:
                it stays in front of anyone about to spend (PRD §7.3). */}
            <p className="text-sm text-muted-foreground">
              Cargar créditos te dará la opción de reservar una mesa completa
              (dos espacios) en caso de que encontrés alguna disponible. Si no
              lográs agarrar una mesa completa, podrás guardar tus créditos o
              usarlos para tu reserva.
            </p>

            {/* This screen exists to settle the money question before the map, so
            it has to be answerable here. Explaining the price and sending the
            participant off to find the purchase somewhere else is what made it
            a dead end. */}
            <div className="flex flex-col gap-2 sm:flex-row">
              {canBuy && (
                <BuyFeatureCreditsButton
                  festivalId={festivalId}
                  featureType="full_table"
                  shortfallAmount={offer.shortfall}
                />
              )}
              <Button
                asChild
                variant={canBuy ? "outline" : "default"}
                className="w-full sm:w-auto"
              >
                <Link href={mapHref}>
                  {canBuy ? "Ahora no, seguir al mapa" : "Continuar"}
                </Link>
              </Button>
            </div>

            <Link
              href="/credits_info"
              className="inline-block text-sm text-primary underline underline-offset-2"
            >
              Cómo funcionan los créditos
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
