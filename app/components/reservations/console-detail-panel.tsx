"use client";

import { CoinsIcon, FileTextIcon, HistoryIcon } from "lucide-react";

import { Badge } from "@/app/components/ui/badge";
import { formatDateWithTime } from "@/app/lib/formatters";
import {
  featureActionLabel,
  featureItemLabel,
} from "@/app/lib/payments/feature-credits";
import type {
  ConsoleEvent,
  ReservationConsoleDetail,
} from "@/app/lib/reservations/console-detail";

const EVENT_LABELS: Record<string, string> = {
  created: "Reserva creada",
  confirmed: "Confirmada",
  rejected: "Rechazada",
  status_changed: "Cambio de estado",
  payment_submitted: "Comprobante enviado",
  deadline_extended: "Plazo extendido",
  settlement_submitted: "Solicitud enviada",
  settlement_approved: "Solicitud aprobada",
  settlement_rejected: "Solicitud rechazada",
  accepted: "Aceptada",
  deleted: "Eliminada",
};

const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  submitted: "En revisión",
  approved: "Aprobado",
  rejected: "Rechazado",
};

/**
 * A payload is written by whichever command recorded the event, so its shape
 * varies. The kinds worth naming get a sentence; the rest are skipped rather
 * than dumped as JSON at an admin.
 */
function describePayload(event: ConsoleEvent): string | null {
  const payload = event.payload;
  if (payload == null || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;

  const money = (value: unknown) =>
    typeof value === "number" ? `Bs${value}` : null;
  const reason = typeof record.reason === "string" ? record.reason : null;
  const suffix = reason ? ` — ${reason}` : "";

  switch (record.kind) {
    case "invoice_credits_applied": {
      const applied = money(record.amount);
      const outstanding = money(record.outstandingAmount);
      if (!applied) return "Aplicó créditos al cobro";
      return outstanding
        ? `Aplicó ${applied} en créditos. Saldo: ${outstanding}`
        : `Aplicó ${applied} en créditos`;
    }
    case "invoice_credits_released":
      return `Devolvió los créditos aplicados${suffix}`;
    case "invoice_shortfall_written_off": {
      const writtenOff = money(record.writtenOffAmount);
      return writtenOff
        ? `Dio por saldado ${writtenOff}${suffix}`
        : `Dio por saldado el resto del cobro${suffix}`;
    }
    default:
      break;
  }

  // The feature commands tag their payload `action` rather than `kind`, so
  // every one of them fell through to a bare "Cambio de estado" — including
  // the late partner, the one event that explains why a reservation billed for
  // one person is standing with two.
  switch (record.action) {
    case "late_partner_added": {
      const total = money(record.totalCredits);
      const difference = money(record.sharedPriceDifference);
      const feature = money(record.featurePrice);
      if (!total) return "Agregó un compañero";
      return difference && feature
        ? `Agregó un compañero: ${total} en créditos (${difference} de diferencia + ${feature} de la función)`
        : `Agregó un compañero: ${total} en créditos`;
    }
    case "full_table_manually_downgraded":
      return "Bajó la reserva a media mesa";
    case "reservation_released": {
      const price = money(record.creditPrice);
      return price
        ? `Liberó el espacio: ${price} en créditos`
        : "Liberó el espacio";
    }
    case "stand_switched":
      return "Cambió de espacio";
    case "stand_exchanged":
      return "Intercambió el espacio con otra reserva";
    default:
      break;
  }

  if (reason) return reason;
  if (typeof record.correction === "string") {
    return `Corrección: ${record.correction}`;
  }
  return null;
}

/**
 * The history behind one row: what credits did, what was sent for review, and
 * every transition the reservation has been through.
 *
 * The event log has been written since the reservation hardening work and read
 * by nothing until now.
 */
export default function ConsoleDetailPanel({
  detail,
}: {
  detail: ReservationConsoleDetail;
}) {
  const { allocations, featureCredits, submissions, events } = detail;
  const charged = featureCredits.filter(
    (action) => action.amount > 0 && !action.reversed,
  );

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <section className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          <CoinsIcon className="h-4 w-4" />
          Créditos
        </h3>
        {allocations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No se aplicaron créditos a este cobro.
          </p>
        ) : (
          <ul className="space-y-2">
            {allocations.map((allocation) => (
              <li key={allocation.id} className="text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Bs{allocation.amount}</span>
                  {allocation.reversed && (
                    <Badge variant="outline" className="text-xs">
                      Devuelto
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDateWithTime(allocation.createdAt)}
                  {allocation.reversedAt &&
                    ` · devuelto el ${formatDateWithTime(allocation.reversedAt)}`}
                </p>
              </li>
            ))}
          </ul>
        )}

        {/*
          The reservation's other credit ledger, kept visually separate from
          the allocations above because it settles a different thing: these
          credits bought the reservation an extra, they did not cover the
          cobro. Folding the two totals together would make the outstanding
          balance read as smaller than it is.
        */}
        {charged.length > 0 && (
          <div className="space-y-2 border-t pt-2">
            <p className="text-xs font-medium text-muted-foreground">
              Créditos gastados en la reserva
            </p>
            <ul className="space-y-2">
              {charged.map((action) => (
                <li key={action.actionId} className="text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Bs{action.amount}</span>
                    <span className="text-xs text-muted-foreground">
                      {featureActionLabel(action.type)}
                    </span>
                  </div>
                  {action.items.length > 0 && (
                    <ul className="mt-0.5 space-y-0.5">
                      {action.items.map((item) => (
                        <li
                          key={`${action.actionId}-${item.kind}`}
                          className="text-xs text-muted-foreground"
                        >
                          {featureItemLabel(item.kind)}: Bs{item.amount}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatDateWithTime(action.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              No cubren el cobro; se pagaron aparte con créditos.
            </p>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          <FileTextIcon className="h-4 w-4" />
          Comprobantes
        </h3>
        {submissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No se envió ningún comprobante todavía.
          </p>
        ) : (
          <ul className="space-y-2">
            {submissions.map((submission) => (
              <li key={submission.id} className="text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {SUBMISSION_STATUS_LABELS[submission.status] ??
                      submission.status}
                  </Badge>
                  {submission.voucherUrl && (
                    <a
                      href={submission.voucherUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      Ver comprobante
                    </a>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Enviado el {formatDateWithTime(submission.createdAt)}
                  {submission.reviewedAt &&
                    ` · revisado el ${formatDateWithTime(submission.reviewedAt)}`}
                  {submission.reviewedBy && ` por ${submission.reviewedBy}`}
                </p>
                {submission.rejectionReason && (
                  <p className="text-xs text-destructive">
                    {submission.rejectionReason}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          <HistoryIcon className="h-4 w-4" />
          Historial
        </h3>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay eventos registrados.
          </p>
        ) : (
          <ol className="space-y-2">
            {events.map((event) => {
              const description = describePayload(event);
              return (
                <li key={event.id} className="text-sm">
                  <span className="font-medium">
                    {EVENT_LABELS[event.eventType] ?? event.eventType}
                  </span>
                  {event.fromStatus &&
                    event.toStatus &&
                    event.fromStatus !== event.toStatus && (
                      <span className="text-muted-foreground">
                        {" "}
                        {event.fromStatus} → {event.toStatus}
                      </span>
                    )}
                  <p className="text-xs text-muted-foreground">
                    {formatDateWithTime(event.createdAt)}
                    {event.actor && ` · ${event.actor}`}
                  </p>
                  {description && <p className="text-xs">{description}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
