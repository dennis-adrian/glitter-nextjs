import { DateTime } from "luxon";

import { Badge, type BadgeVariant } from "@/app/components/ui/badge";
import { formatDate } from "@/app/lib/formatters";
import type { RosterEntry } from "@/app/lib/programs/occurrence-queries";
import { formatMoney } from "@/app/lib/programs/pricing";
import {
  ROSTER_SEAT_STATE_LABELS,
  type RosterSeatState,
} from "@/app/lib/programs/roster";

const STATE_VARIANT: Record<RosterSeatState, BadgeVariant> = {
  confirmed: "green",
  awaiting_review: "amber",
  changes_requested: "orange",
  holding: "secondary",
  released: "outline",
};

type Props = {
  entries: RosterEntry[];
};

/**
 * Who has a seat in one occurrence.
 *
 * Released rows are kept rather than filtered out. They are the record of
 * people who started and did not finish — the drop-off between "reservando"
 * and "confirmado" is the first place to look when a payment step is failing,
 * and an admin chasing a specific person needs to find them whatever became of
 * their purchase.
 */
export default function OccurrenceRosterTable({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía nadie se inscribió a este horario.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-2 py-2 font-medium">Persona</th>
            <th className="px-2 py-2 font-medium">Estado</th>
            <th className="px-2 py-2 font-medium">Entrada</th>
            <th className="px-2 py-2 font-medium">Monto</th>
            <th className="px-2 py-2 font-medium">Inscripción</th>
            <th className="px-2 py-2 font-medium">Compra</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry.lineId}
              className="border-b border-border/60 last:border-b-0 align-top"
            >
              <td className="px-2 py-3">
                <p className="font-medium">{entry.attendeeName}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.attendeeEmail}
                </p>
                {entry.attendeePhone ? (
                  <p className="text-xs text-muted-foreground">
                    {entry.attendeePhone}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {entry.isGuest ? "Invitado" : "Con cuenta"}
                </p>
              </td>
              <td className="px-2 py-3">
                <Badge variant={STATE_VARIANT[entry.state]}>
                  {ROSTER_SEAT_STATE_LABELS[entry.state]}
                </Badge>
                {/* Only meaningful while the clock is running; a lapsed hold
                    already reads as "Liberado". */}
                {entry.state === "holding" && entry.holdExpiresAt ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Vence{" "}
                    {formatDate(entry.holdExpiresAt).toLocaleString(
                      DateTime.TIME_SIMPLE,
                    )}
                  </p>
                ) : null}
              </td>
              <td className="px-2 py-3">
                {entry.ticketCode ? (
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {entry.ticketCode}
                  </code>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Sin emitir
                  </span>
                )}
              </td>
              <td className="px-2 py-3 whitespace-nowrap">
                <div>
                  {entry.isFree ? (
                    <span className="text-xs text-muted-foreground">
                      Gratis
                    </span>
                  ) : (
                    <p>{formatMoney(entry.unitPrice)}</p>
                  )}
                  {entry.promoCode ? (
                    <p className="text-xs font-medium text-purple-700">
                      {entry.promoCode} · {entry.promoPartnerName}
                    </p>
                  ) : null}
                </div>
              </td>
              <td className="px-2 py-3 whitespace-nowrap text-xs text-muted-foreground">
                {formatDate(entry.createdAt).toLocaleString(
                  DateTime.DATETIME_MED,
                )}
              </td>
              {/* Not a link: `/programs/purchases/[id]` is the buyer's page and
                  `resolvePurchaseAccess` grants only the owner or a valid
                  token — there is no admin bypass, so linking there would send
                  the team to a denied page. The id is here to correlate with
                  the review queue and with support actions. */}
              <td className="px-2 py-3 text-xs text-muted-foreground">
                #{entry.purchaseId}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
