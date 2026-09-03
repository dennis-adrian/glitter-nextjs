import { CoinsIcon } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { formatCredits } from "@/app/components/credits/credit-amount";
import FullTableGraphic from "@/app/components/festivals/reservations/full-table-graphic";
import Title from "@/app/components/atoms/heading";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { isFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { fetchFeatureConfig } from "@/app/lib/festivals/feature-config-service";
import { isFullTableCategory } from "@/app/lib/reservations/full-table-access";
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

  const [creditsEnabled, config] = await Promise.all([
    isFeatureEnabled("credits"),
    fetchFeatureConfig(festivalId, "full_table", forProfile.category),
  ]);
  if (!creditsEnabled || !config || !config.enabled || !config.available) {
    redirect(mapHref);
  }

  return (
    <div className="container max-w-[720px] p-4 md:p-6">
      <div className="mb-4 flex flex-col gap-1 md:gap-2">
        <Title>Antes de elegir tu espacio</Title>
        <p className="text-sm leading-tight text-muted-foreground md:text-base">
          Ya estás inscrito. Hay una decisión que conviene tomar ahora, con
          calma, y no cuando estés eligiendo tu espacio en el plano.
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CoinsIcon className="h-5 w-5 text-amber-500" />1 crédito = Bs 1
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Los créditos son la forma de pagar dentro del festival. Un crédito
              vale exactamente un boliviano. Los comprás desde aquello que
              querés pagar y siempre por el monto exacto que te falta.
            </p>
            <Link
              href="/credits_info"
              className="inline-block text-sm text-primary underline underline-offset-2"
            >
              Cómo funcionan los créditos
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Media mesa y mesa completa</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="mx-auto w-full max-w-[260px] shrink-0 sm:mx-0 sm:w-[240px]">
                <FullTableGraphic variant="full" />
              </div>
              <div className="flex-1 space-y-3 text-sm text-muted-foreground">
                <p>
                  Un espacio es media mesa: 120 × 60 cm. Es lo que reservás
                  normalmente y no tiene ningún costo extra.
                </p>
                <p>
                  Una mesa completa son dos espacios contiguos, 240 × 60 cm,
                  para vos solo. Es opcional y se paga con créditos.
                </p>
                <p className="text-foreground">
                  Cuesta{" "}
                  <span className="font-semibold">
                    {formatCredits(config.creditPrice)} en créditos
                  </span>
                  .
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* The most important thing on this screen: what the money buys. */}
        <Card>
          <CardHeader>
            <CardTitle>Qué comprás exactamente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p className="rounded-md bg-muted p-3 text-foreground">
              Activar la mesa completa te habilita a{" "}
              <strong>intentar tomar una</strong> mientras haya disponibles.{" "}
              <strong>No reserva ni garantiza</strong> ninguna mesa ni ninguna
              ubicación.
            </p>
            <p>
              Mientras está activada, esos créditos quedan apartados. Si al
              final tomás un solo espacio, no se te cobra nada por la función y
              podés usar esos mismos créditos para pagar tu reserva.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>No tenés que decidirlo ahora</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Seguí adelante sin activar nada. Vas a encontrar la mesa completa
              en la misma página donde elegís tu espacio, y podés activarla en
              cualquier momento antes de reservar. Tu inscripción y tu turno no
              cambian en nada por esto.
            </p>
          </CardContent>
        </Card>

        <Button asChild className="w-full sm:w-auto">
          <Link href={mapHref}>Continuar</Link>
        </Button>
      </div>
    </div>
  );
}
