"use client";

import { CoinsIcon, FileTextIcon, HistoryIcon } from "lucide-react";

import { Badge } from "@/app/components/ui/badge";
import { formatDateWithTime } from "@/app/lib/formatters";
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

  switch (record.kind) {
    case "invoice_credits_applied":
      return `Aplicó Bs${record.amount} en créditos. Saldo: Bs${record.outstandingAmount}`;
    case "invoice_credits_released":
      return `Devolvió los créditos aplicados${
        record.reason ? ` — ${record.reason}` : ""
      }`;
    case "invoice_shortfall_written_off":
      return `Dio por saldado Bs${record.writtenOffAmount}${
        record.reason ? ` — ${record.reason}` : ""
      }`;
    default:
      break;
  }
  if (typeof record.reason === "string") return record.reason;
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
  const { allocations, submissions, events } = detail;

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
