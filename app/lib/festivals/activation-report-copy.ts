import { DateTime } from "luxon";

import { formatDisplayDate } from "@/app/lib/formatters";
import type {
  ActivationRecipient,
  ActivationRecipientFilter,
  ActivationReport,
} from "@/app/lib/festivals/activation-report";

/**
 * The words of the activation notice's report. Client-safe: no database, so
 * the tests and the pages share them.
 */

function fmt(value: number) {
  return value.toLocaleString("es-BO");
}

function plural(count: number, one: string, many: string) {
  return `${fmt(count)} ${count === 1 ? one : many}`;
}

/** "64%"; nothing to divide is 0%. */
export function percent(part: number, whole: number) {
  return `${whole > 0 ? Math.round((part / whole) * 100) : 0}%`;
}

export type ReportTile = { label: string; value: string; sub?: string };

export function activationReportTiles(report: ActivationReport): ReportTile[] {
  const { kpis } = report;
  const pushNotes = [
    plural(kpis.pushSent, "dispositivo", "dispositivos"),
    kpis.pushFailed > 0 ? `${fmt(kpis.pushFailed)} no se pudieron enviar` : null,
    kpis.pushPending > 0 ? `${fmt(kpis.pushPending)} pendientes` : null,
  ].filter(Boolean);
  return [
    {
      label: "Notificados",
      value: fmt(kpis.notified),
      sub: `el ${formatDisplayDate(report.sentAt, DateTime.DATETIME_MED)}`,
    },
    {
      label: "Leídos en Glitter",
      value: `${fmt(kpis.read)} (${percent(kpis.read, kpis.notified)})`,
      sub: `${fmt(kpis.notified - kpis.read)} sin leer`,
    },
    {
      label: "Con push enviado",
      value: fmt(kpis.pushReached),
      sub: pushNotes.join(" · "),
    },
    {
      label: "Inscritos después del aviso",
      value: `${fmt(kpis.enrolledAfter)} (${percent(kpis.enrolledAfter, kpis.notified)})`,
      sub:
        kpis.enrolledBefore > 0
          ? `${fmt(kpis.enrolledBefore)} ya ${kpis.enrolledBefore === 1 ? "estaba inscrito" : "estaban inscritos"}`
          : undefined,
    },
  ];
}

export const PUSH_SENT_NOTE =
  "Un push cuenta como enviado cuando el servicio de notificaciones del teléfono lo aceptó; no sabemos si el teléfono lo mostró.";

export const ACTIVATION_FILTER_LABELS: Record<ActivationRecipientFilter, string> =
  {
    all: "Todos",
    unread: "Sin leer",
    read: "Leídos",
    enrolled: "Inscritos",
    not_enrolled: "Sin inscribirse",
  };

const short = (date: Date) => formatDisplayDate(date, DateTime.DATETIME_MED);

export function readCell(recipient: Pick<ActivationRecipient, "readAt">) {
  return recipient.readAt ? `Leído el ${short(recipient.readAt)}` : "Sin leer";
}

export function pushCell(push: ActivationRecipient["push"]) {
  const parts = [
    push.sent > 0 ? (push.sent === 1 ? "Enviado" : `Enviado a ${fmt(push.sent)} dispositivos`) : null,
    push.failed > 0 ? (push.failed === 1 ? "1 no enviado" : `${fmt(push.failed)} no enviados`) : null,
    push.pending > 0 ? "Pendiente" : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Sin push";
}

const ENROLLMENT_STATUS: Record<
  NonNullable<ActivationRecipient["enrollment"]>["status"],
  string
> = {
  pending: "en revisión",
  accepted: "aceptada",
  rejected: "rechazada",
};

export function enrollmentCell(
  enrollment: ActivationRecipient["enrollment"],
) {
  if (!enrollment) return "Sin inscribirse";
  const status = ENROLLMENT_STATUS[enrollment.status];
  return enrollment.afterNotice
    ? `Inscrito el ${short(enrollment.at)} (${status})`
    : `Ya estaba inscrito (${status})`;
}
