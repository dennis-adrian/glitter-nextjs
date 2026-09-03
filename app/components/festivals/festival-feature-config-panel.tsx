import FestivalFeatureConfigRow from "@/app/components/festivals/festival-feature-config-row";
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
  const [actor, scopes] = await Promise.all([
    getCurrentUserProfile(),
    fetchFestivalFeatureScopes(festivalId),
  ]);
  const canEdit = canMutateAdminReservations(actor);

  return (
    <section className="mt-6 space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Funciones de reserva</h2>
        <p className="text-sm text-muted-foreground">
          Se pagan con créditos. Un cambio acá solo afecta activaciones futuras:
          lo que un participante ya compró conserva su precio.
        </p>
      </div>

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
