import Link from "next/link";

import { Badge } from "@/app/components/ui/badge";
import type { OccurrenceRosterSummary } from "@/app/lib/programs/occurrence-queries";

type Props = {
  summary: OccurrenceRosterSummary;
  /** Omitted on the detail page itself, which is where the link would go. */
  href?: string;
};

/**
 * The seat line for one occurrence: what is sold, what needs attention, and
 * what is left.
 *
 * This replaced a bare `20 cupos` — the configured capacity, which told an
 * admin nothing about whether the session had sold nothing or sold out. Every
 * number here comes from `fetchOccurrenceSummaries`, which derives them from
 * the same `resolveAvailability` the public pages use, so what an admin reads
 * is what a buyer is allowed to take.
 */
export default function OccurrenceSeatSummary({ summary, href }: Props) {
  const { totals, capacity, remaining, waitlistActive, isSoldOut } = summary;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant={isSoldOut ? "red" : "green"}>
        {remaining} de {capacity} disponibles
      </Badge>

      {/* The only count here whose noun inflects — "reservando", "por revisar"
          and "en espera" read the same at any number. */}
      {totals.confirmed > 0 ? (
        <Badge variant="outline">
          {totals.confirmed}{" "}
          {totals.confirmed === 1 ? "confirmado" : "confirmados"}
        </Badge>
      ) : null}

      {/* The only count that is a to-do list, so it is the only one that
          shouts. Everything else is context. */}
      {totals.needsAction > 0 ? (
        <Badge variant="amber">{totals.needsAction} por revisar</Badge>
      ) : null}

      {totals.holding > 0 ? (
        <Badge variant="outline">{totals.holding} reservando</Badge>
      ) : null}

      {waitlistActive > 0 ? (
        <Badge variant="secondary">{waitlistActive} en espera</Badge>
      ) : null}

      {href ? (
        <Link
          href={href}
          className="text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          Ver inscritos
        </Link>
      ) : null}
    </div>
  );
}
