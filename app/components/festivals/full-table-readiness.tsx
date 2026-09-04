import { CheckIcon, XIcon } from "lucide-react";

import type { FullTableReadiness } from "@/app/lib/stands/full-table-queries";

type FullTableReadinessListProps = {
  readiness: FullTableReadiness;
  /** Whether the `credits` flag is public. Global, not per category. */
  creditsLaunched: boolean;
  /** Whether this category's full-table config is switched on. */
  enabled: boolean;
};

type Check = { label: string; ok: boolean; fix?: string };

/**
 * Everything this category still needs before a participant is offered a full
 * table.
 *
 * Each gate fails silently on the participant's side — an unpriced pair, a
 * half-taken one, or credits still hidden all just remove the banner, with
 * nothing to tell an admin which one did it. Enabling the feature and seeing
 * nothing change is the failure this list exists to explain.
 */
export default function FullTableReadinessList({
  readiness,
  creditsLaunched,
  enabled,
}: FullTableReadinessListProps) {
  const checks: Check[] = [
    {
      label: "Créditos publicados para participantes",
      ok: creditsLaunched,
      fix: "La funcionalidad Créditos todavía no es pública, así que nadie puede pagar.",
    },
    {
      label: "Función activada en esta categoría",
      ok: enabled,
      fix: "Se configura por categoría: activarla en otra no alcanza.",
    },
    {
      label: "Mesas declaradas con precio",
      ok: readiness.declaredPairs > 0,
      fix:
        readiness.unpricedPairs > 0
          ? `Hay ${readiness.unpricedPairs} mesa${readiness.unpricedPairs === 1 ? "" : "s"} declarada${readiness.unpricedPairs === 1 ? "" : "s"} sin precio. Una mesa sin precio no se ofrece.`
          : "Declaralas desde la gestión de espacios, seleccionando las dos mitades.",
    },
    {
      label: "Alguna mesa con las dos mitades libres",
      ok: readiness.hasFreePair,
      fix: "Todas las mesas tienen al menos una mitad tomada, así que la oferta no se muestra. Vuelve sola si se libera.",
    },
  ];

  const blocking = checks.filter((check) => !check.ok);

  return (
    <div className="space-y-1 rounded-md bg-muted/50 p-2">
      <p className="text-xs font-medium">
        {blocking.length === 0
          ? "Los participantes ven la oferta"
          : "Todavía no se ofrece"}
      </p>

      <ul className="space-y-1">
        {checks.map((check) => (
          <li key={check.label} className="flex items-start gap-1.5 text-xs">
            {check.ok ? (
              <CheckIcon
                className="mt-0.5 h-3 w-3 shrink-0 text-green-600"
                aria-hidden
              />
            ) : (
              <XIcon
                className="mt-0.5 h-3 w-3 shrink-0 text-red-600"
                aria-hidden
              />
            )}
            <span className={check.ok ? "text-muted-foreground" : ""}>
              <span className="sr-only">
                {check.ok ? "Listo: " : "Falta: "}
              </span>
              {check.label}
              {!check.ok && check.fix && (
                <span className="block text-muted-foreground">{check.fix}</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {readiness.declaredPairs > 0 && (
        <p className="text-xs text-muted-foreground">
          {readiness.declaredPairs} mesa
          {readiness.declaredPairs === 1 ? "" : "s"} con precio
          {readiness.unpricedPairs > 0 && `, ${readiness.unpricedPairs} sin`}.
        </p>
      )}

      {/* Said plainly so the list is not mistaken for the whole story: these
          are the festival-wide gates, and each participant still has to be
          verified, enrolled and on the current terms. */}
      <p className="text-xs text-muted-foreground">
        Cada participante además tiene que estar verificado, inscrito y con los
        términos aceptados.
      </p>
    </div>
  );
}
