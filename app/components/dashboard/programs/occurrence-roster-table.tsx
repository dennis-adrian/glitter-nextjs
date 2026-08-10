"use client";
"use no memo";

import { DateTime } from "luxon";
import { useMemo } from "react";

import {
  type ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";

import RosterCheckInButton from "@/app/components/dashboard/programs/checkin/roster-check-in-button";
import { Badge, type BadgeVariant } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
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

/** Large enough that a single occurrence's roster never paginates in practice. */
const PAGE_SIZE = 50;

/** Where each row's occurrence lives, keyed by `RosterEntry.occurrenceId`. */
export type RosterOccurrenceContext = Map<
  number,
  { sessionTitle: string; occurrenceLabel: string }
>;

type Props = {
  entries: RosterEntry[];
  /**
   * Present only when rows can span more than one occurrence — a
   * program-wide search result, never a single occurrence's own roster
   * (§5.6). Its presence, not the row count, decides whether the Sesión and
   * Horario columns render.
   */
  occurrenceContext?: RosterOccurrenceContext;
  /**
   * Offers the manual "marcar ingreso" fallback on confirmed rows. Off by
   * default: check-in belongs to one occurrence's door (§7.3), so the
   * program-wide roster shows arrival times without offering to create them.
   */
  allowCheckIn?: boolean;
};

/**
 * Who has a seat in one occurrence, or in a set of occurrences when the
 * caller supplies `occurrenceContext`.
 *
 * Released rows are kept rather than filtered out. They are the record of
 * people who started and did not finish — the drop-off between "reservando"
 * and "confirmado" is the first place to look when a payment step is failing,
 * and an admin chasing a specific person needs to find them whatever became of
 * their purchase. Whether released rows ever reach this component is the
 * caller's decision (occurrence scope always shows them; the program roster
 * hides them behind a toggle) — this table just renders whatever it is given.
 */
export default function OccurrenceRosterTable({
  entries,
  occurrenceContext,
  allowCheckIn = false,
}: Props) {
  const columns = useMemo<ColumnDef<RosterEntry, unknown>[]>(
    () => [{ id: "row" }],
    [],
  );

  const table = useReactTable({
    data: entries,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: PAGE_SIZE } },
  });

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía nadie se inscribió a este horario.
      </p>
    );
  }

  const rows = table.getRowModel().rows;
  const showPagination = table.getPageCount() > 1;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-2 py-2 font-medium">Persona</th>
              <th className="px-2 py-2 font-medium">Estado</th>
              <th className="px-2 py-2 font-medium">Entrada</th>
              <th className="px-2 py-2 font-medium">Ingreso</th>
              <th className="px-2 py-2 font-medium">Monto</th>
              <th className="px-2 py-2 font-medium">Inscripción</th>
              <th className="px-2 py-2 font-medium">Compra</th>
              {occurrenceContext ? (
                <>
                  <th className="px-2 py-2 font-medium">Sesión</th>
                  <th className="px-2 py-2 font-medium">Horario</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const entry = row.original;
              const context = occurrenceContext?.get(entry.occurrenceId);

              return (
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
                    {entry.checkedInAt ? (
                      <Badge variant="green">
                        {formatDate(entry.checkedInAt).toLocaleString(
                          DateTime.TIME_SIMPLE,
                        )}
                      </Badge>
                    ) : allowCheckIn &&
                      entry.state === "confirmed" &&
                      entry.ticketCode ? (
                      <RosterCheckInButton
                        occurrenceId={entry.occurrenceId}
                        ticketCode={entry.ticketCode}
                        attendeeName={entry.attendeeName}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
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
                  {occurrenceContext ? (
                    <>
                      <td className="px-2 py-3 text-xs">
                        {context?.sessionTitle ?? "—"}
                      </td>
                      <td className="px-2 py-3 whitespace-nowrap text-xs">
                        {context?.occurrenceLabel ?? "—"}
                      </td>
                    </>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showPagination ? (
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <p>
            Página {table.getState().pagination.pageIndex + 1} de{" "}
            {table.getPageCount()} · {entries.length} entradas
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Siguiente
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
