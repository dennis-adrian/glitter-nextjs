import {
  IMPERSONATION_STATE_LABELS,
  type RecentImpersonation,
} from "@/app/lib/impersonation/definitions";
import { formatDateTime } from "@/app/lib/formatters";
import { getUserName } from "@/app/lib/users/utils";

function duration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes === 1 ? "1 minuto" : `${minutes} minutos`;
}

function personName(
  person: RecentImpersonation["admin"] | RecentImpersonation["subject"],
) {
  if (!person) return "Cuenta eliminada";
  return getUserName(person) || person.email;
}

/**
 * "Recientes": the audit of "Entrar como participante", as the picker shows
 * one admin's views and a person's admin page shows the views of their
 * account (docs/PLAN-impersonation.md §6).
 */
export default function RecentImpersonations({
  rows,
  show,
  title,
  empty,
}: {
  rows: RecentImpersonation[];
  /** Whose name each row leads with. */
  show: "subject" | "admin";
  title: string;
  empty: string;
}) {
  return (
    <section aria-labelledby="recent-impersonations" className="space-y-3">
      <h2
        id="recent-impersonations"
        className="font-display text-lg font-semibold text-brand-ink"
      >
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-brand-border rounded-xl border border-brand-border bg-brand-card">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm"
            >
              <span className="min-w-0 font-medium text-brand-ink">
                {personName(show === "subject" ? row.subject : row.admin)}
              </span>
              <span className="text-muted-foreground">
                {formatDateTime(row.startedAt)} ·{" "}
                {duration(row.durationSeconds)} ·{" "}
                {IMPERSONATION_STATE_LABELS[row.state]}
                {row.blockedWrites > 0
                  ? ` · ${row.blockedWrites} ${
                      row.blockedWrites === 1
                        ? "acción bloqueada"
                        : "acciones bloqueadas"
                    }`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
