import Link from "next/link";

import FestivalFeatureConfigRow from "@/app/components/festivals/festival-feature-config-row";
import { isFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { fetchFestivalFeatureScopes } from "@/app/lib/festivals/feature-config-service";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

type FestivalFeatureConfigPanelProps = {
  festivalId: number;
};

/**
 * Availability and pricing for the optional reservation features.
 *
 * Every scope is listed even when never configured, so an admin sees the whole
 * surface rather than only what someone happened to touch.
 */
export default async function FestivalFeatureConfigPanel({
  festivalId,
}: FestivalFeatureConfigPanelProps) {
  const [actor, scopes, creditsRevealed] = await Promise.all([
    getCurrentUserProfile(),
    fetchFestivalFeatureScopes(festivalId),
    isFeatureEnabled("credits"),
  ]);
  const canEdit = canMutateAdminReservations(actor);

  // Enabling a feature here is necessary but not sufficient: every one of them
  // is paid for in credits, and the `credits` flag is what reveals credits to
  // participants at all. With it hidden, switching a feature on looks like it
  // worked and changes nothing anyone can see.
  const enabledButUnreachable =
    !creditsRevealed && scopes.some((scope) => scope.config?.enabled);

  return (
    <section className="mt-6 space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Funciones de reserva</h2>
        <p className="text-sm text-muted-foreground">
          Se pagan con créditos. Un cambio acá solo afecta activaciones futuras:
          lo que un participante ya compró conserva su precio.
        </p>
      </div>

      {enabledButUnreachable && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          Hay funciones activadas acá, pero los créditos todavía están ocultos
          para los participantes, así que nadie las ve ni las puede pagar.
          Publicá la funcionalidad <strong>Créditos</strong> en{" "}
          <Link href="/dashboard/feature_flags" className="underline">
            Funcionalidades
          </Link>{" "}
          para que aparezcan.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {scopes.map((scope) => (
          <FestivalFeatureConfigRow
            key={`${scope.type}-${scope.category ?? "all"}`}
            festivalId={festivalId}
            scope={scope}
            canEdit={canEdit}
          />
        ))}
      </div>
    </section>
  );
}
