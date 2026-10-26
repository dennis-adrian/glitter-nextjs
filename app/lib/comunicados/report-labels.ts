import type { ComunicadoAudienceSummary } from "@/app/lib/comunicados/definitions";
import { COMUNICADO_RETRACTED_SKIP_REASON } from "@/app/lib/comunicados/skip-reasons";
import {
  confirmadosListName,
  formatAudienceCount,
} from "@/app/lib/distribution_lists/definitions";
import { formatDisplayDate } from "@/app/lib/formatters";

/**
 * A sent comunicado's report in words (docs/IMPLEMENTATION-comunicados.md F6,
 * G6): the labels of each recipient's row and the sentences built from the
 * counts. Client-safe and pure, so the Correo table can be tested row by row:
 * a clause with nobody in it is left out, and one reads in the singular.
 */

export const COMUNICADO_REPORT_PAGE_SIZE = 50;
/** "No avanza": email is waiting and nothing settled for this long (G6). */
export const COMUNICADO_STALL_MS = 10 * 60_000;

/**
 * Resend refused the key or the sender: the lane holds the rows and retries
 * every 15 minutes (D3). The codes the lane writes, as `bulk-email.ts` names
 * them.
 */
export const RESEND_CONFIG_ERRORS: ReadonlySet<string> = new Set([
  "resend:invalid_api_key",
  "resend:missing_api_key",
  "resend:restricted_api_key",
  "resend:invalid_from_address",
  "resend:security_error",
]);
/** The plan's allowance ran out: those rows end failed until a retry (D3). */
export const RESEND_QUOTA_ERRORS: ReadonlySet<string> = new Set([
  "resend:daily_quota_exceeded",
  "resend:monthly_quota_exceeded",
]);

export const COMUNICADO_RECIPIENT_FILTERS = [
  "all",
  "unread",
  "email_not_sent",
  "skipped",
  "error",
] as const;
export type ComunicadoRecipientFilter =
  (typeof COMUNICADO_RECIPIENT_FILTERS)[number];

export const COMUNICADO_RECIPIENT_FILTER_LABELS = {
  all: "Todos",
  unread: "No leídos",
  email_not_sent: "Correo no enviado",
  skipped: "Omitidos",
  error: "Con error",
} as const satisfies Record<ComunicadoRecipientFilter, string>;

/** `?filter=` as the report reads it: anything else is everyone. */
export function parseRecipientFilter(
  value: unknown,
): ComunicadoRecipientFilter {
  return (
    COMUNICADO_RECIPIENT_FILTERS.find((filter) => filter === value) ?? "all"
  );
}

/** The report's own URL: everyone, no search and the first page leave theirs out. */
export function comunicadoReportHref(
  comunicadoId: number,
  {
    filter = "all",
    query = "",
    page = 1,
  }: { filter?: ComunicadoRecipientFilter; query?: string; page?: number } = {},
) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  const term = query.trim();
  if (term) params.set("q", term);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  const path = `/dashboard/communications/${comunicadoId}`;
  return search ? `${path}?${search}` : path;
}

const fmt = formatAudienceCount;

/** "10:14 AM", in Bolivia time. */
export function reportTimeLabel(date: Date) {
  return formatDisplayDate(date, { hour: "numeric", minute: "2-digit" });
}

/** "1–50 de 1.254": the rows on this page of the recipients table. */
export function recipientsRangeLabel(
  page: number,
  pageSize: number,
  total: number,
) {
  if (total === 0) return "0 de 0";
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return `${fmt(first)}–${fmt(last)} de ${fmt(total)}`;
}

export type ComunicadoRecipientStatus =
  | "pending"
  | "notified"
  | "skipped"
  | "failed"
  | "granted";

export type ComunicadoEmailDelivery = {
  status: "pending" | "processing" | "sent" | "failed" | "skipped";
  lastError: string | null;
  /** An attempt under the row's key may have reached Resend (V6). */
  maybeSent: boolean;
  sentAt: Date | null;
  /** The revision the accepted request carried; null on a replay. */
  contentRevision: number | null;
};

/** Codes a pre-check or a retraction skips an email with (D3, F3). */
const SKIPPED_EMAIL_LABELS: ReadonlyMap<string, string> = new Map([
  ["suppressed", "Correo bloqueado (rebote o spam)"],
  ["invalid_address", "Correo inválido"],
  ["not_eligible", "Ya no puede recibirlo"],
  ["deleting", "Cuenta en eliminación"],
  ["staging", "Entorno de prueba"],
  ["retracted", "Cancelado (retirado)"],
]);

function failedEmailLabel(lastError: string | null) {
  if (lastError === "expired") return "Venció sin enviarse";
  if (lastError === "address_changed") return "Cambió su correo";
  if (lastError && RESEND_QUOTA_ERRORS.has(lastError))
    return "Límite de Resend";
  return "Con error";
}

/**
 * The Correo column, from the person's latest email delivery (G6, D-24). The
 * first matching case wins: a row that may have landed says so whatever
 * ended it, and only an unknown skip code reads "No se envió".
 */
export function comunicadoEmailLabel(input: {
  delivery: ComunicadoEmailDelivery | null;
  /** The address asked for no bulk mail at all, not only announcements. */
  unsubscribedAll: boolean;
  sendEmail: boolean;
  recipientStatus: ComunicadoRecipientStatus;
  currentRevision: number;
}): string {
  const { delivery } = input;
  if (!delivery) {
    if (!input.sendEmail) return "Sin correo";
    if (input.recipientStatus === "pending") return "En cola";
    // Notified without a row: there was no address to write one for.
    if (input.recipientStatus === "notified") return "Sin correo";
    return "—";
  }

  const { status, lastError } = delivery;
  const unsettled = status === "pending" || status === "processing";
  if (status === "sent") {
    if (lastError === "idempotent_replay") {
      return "Enviado (sin confirmación por persona)";
    }
    const sent = delivery.sentAt
      ? `Enviado ${reportTimeLabel(delivery.sentAt)}`
      : "Enviado";
    const revision = delivery.contentRevision;
    return revision !== null && revision < input.currentRevision
      ? `${sent} · versión ${revision}`
      : sent;
  }
  if (delivery.maybeSent) {
    return unsettled ? "En cola (puede haber llegado)" : "Puede haber llegado";
  }
  if (unsettled) return "En cola";
  if (status === "skipped") {
    if (lastError === "unsubscribed") {
      return input.unsubscribedAll
        ? "Se dio de baja de los correos masivos"
        : "Se dio de baja de los anuncios";
    }
    return SKIPPED_EMAIL_LABELS.get(lastError ?? "") ?? "No se envió";
  }
  return failedEmailLabel(lastError);
}

/** The App column: whether the inbox item reached them, and was read. */
export function comunicadoAppLabel(input: {
  status: ComunicadoRecipientStatus;
  skippedReason: string | null;
  readAt: Date | null;
}): string {
  switch (input.status) {
    case "notified":
      return input.readAt ? "Leído" : "No leído";
    case "pending":
      return "En cola";
    case "failed":
      return "Falló";
    case "skipped":
      return input.skippedReason === COMUNICADO_RETRACTED_SKIP_REASON
        ? COMUNICADO_RETRACTED_SKIP_REASON
        : `Omitido: ${input.skippedReason ?? "—"}`;
    case "granted":
      return "—";
  }
}

/** The Dispositivo column: "Enviada a 2" counts the devices it reached. */
export function comunicadoDeviceLabel(input: {
  sendPush: boolean;
  notified: boolean;
  pushes: number;
  pushesSent: number;
}): string {
  if (!input.sendPush || !input.notified) return "—";
  if (input.pushesSent > 0) return `Enviada a ${fmt(input.pushesSent)}`;
  return input.pushes === 0 ? "Sin dispositivos" : "—";
}

/** A share in whole percent; nothing to divide by reads 0. */
export function wholePercent(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

const oneDecimal = new Intl.NumberFormat("es-BO", {
  maximumFractionDigits: 1,
});

/** "Leídos en la app": "512 · 41 %". */
export function readKpiValue(read: number, recipients: number) {
  return `${fmt(read)} · ${wholePercent(read, recipients)} %`;
}

/** "Destinatarios": "14 no lo recibieron". */
export function notReceivedText(count: number) {
  return count === 1 ? "1 no lo recibió" : `${fmt(count)} no lo recibieron`;
}

/** "Correos no enviados": "34 bajas · 12 bloqueados · 6 con error". */
export function emailNotSentText(counts: {
  unsubscribed: number;
  suppressed: number;
  failed: number;
  other: number;
}) {
  const { unsubscribed, suppressed, failed, other } = counts;
  const parts = [
    unsubscribed === 1 ? "1 baja" : `${fmt(unsubscribed)} bajas`,
    suppressed === 1 ? "1 bloqueado" : `${fmt(suppressed)} bloqueados`,
    `${fmt(failed)} con error`,
  ];
  if (other > 0) parts.push(other === 1 ? "1 otro" : `${fmt(other)} otros`);
  return parts.join(" · ");
}

/**
 * "Rebotes y spam": "0,8 % · desde este comunicado", over the emails Resend
 * confirmed one by one (a replay has no id, so it is left out).
 */
export function bounceShareText(bounces: number, confirmedSent: number) {
  const share = confirmedSent > 0 ? (bounces / confirmedSent) * 100 : 0;
  return `${oneDecimal.format(share)} % · desde este comunicado`;
}

/** "Enviado el sáb, 24 oct, 10:12 AM por Dennis". */
export function sentByText(moment: string, by: string | null) {
  return by ? `Enviado el ${moment} por ${by}` : `Enviado el ${moment}`;
}

/**
 * "Destinatarios al enviar: Confirmados · Glitter Navidad 2026: 312 ·
 * Ilustradores: 845 · 3 personas por nombre". The people picked by name are
 * their own label. Null when the summary has no source.
 */
export function audienceSourcesText(summary: ComunicadoAudienceSummary) {
  if (summary.sources.length === 0) return null;
  const parts = summary.sources.map((source) =>
    source.kind === "people"
      ? source.label
      : `${source.label}: ${fmt(source.eligible)}`,
  );
  return `Destinatarios al enviar: ${parts.join(" · ")}`;
}

/**
 * The essential record (B7): "Correo esencial · Confirmados · Glitter
 * Navidad 2026 · lo confirmó Dennis el sáb, 24 oct, 10:11 AM · «…» · 30
 * personas dadas de baja de los anuncios lo recibieron igual · 4 sin correos
 * masivos no." The counts are the summary's, frozen at send.
 */
export function essentialRecordText(input: {
  summary: ComunicadoAudienceSummary | null;
  confirmedBy: string | null;
  /** The confirmation's moment, already formatted. */
  confirmedAt: string | null;
  reason: string | null;
}) {
  const { summary } = input;
  const parts = ["Correo esencial"];
  if (summary?.essentialFestival) {
    parts.push(confirmadosListName(summary.essentialFestival.name));
  }
  if (input.confirmedAt) {
    parts.push(
      input.confirmedBy
        ? `lo confirmó ${input.confirmedBy} el ${input.confirmedAt}`
        : `confirmado el ${input.confirmedAt}`,
    );
  }
  if (input.reason) parts.push(`«${input.reason}»`);
  if (summary) {
    const overridden = summary.essentialOverride;
    parts.push(
      overridden === 1
        ? "1 persona dada de baja de los anuncios lo recibió igual"
        : `${fmt(overridden)} personas dadas de baja de los anuncios lo recibieron igual`,
      `${fmt(summary.email.unsubscribedAll)} sin correos masivos no`,
    );
    if (summary.email.suppressed > 0) {
      parts.push(`${fmt(summary.email.suppressed)} con el correo bloqueado no`);
    }
  }
  return `${parts.join(" · ")}.`;
}

/**
 * "Lo estamos enviando: ya está en la app de 820 de 1.240 personas y
 * salieron 600 correos. Esta página se actualiza sola."
 */
export function sendingBannerText(input: {
  notified: number;
  pending: number;
  emailSent: number;
  sendEmail: boolean;
}) {
  const total = input.notified + input.pending;
  const people = total === 1 ? "1 persona" : `${fmt(total)} personas`;
  const app = `ya está en la app de ${fmt(input.notified)} de ${people}`;
  const email = !input.sendEmail
    ? ""
    : input.emailSent === 1
      ? " y salió 1 correo"
      : ` y salieron ${fmt(input.emailSent)} correos`;
  return `Lo estamos enviando: ${app}${email}. Esta página se actualiza sola.`;
}

export const CONFIG_STALLED_BANNER_TEXT =
  "Detenido: Resend rechazó el envío (clave o remitente). Avisale a quien administra Resend. Reintentamos cada 15 minutos; los correos que no salgan en 20 horas quedan como vencidos.";

export const QUOTA_BANNER_TEXT =
  "Resend no acepta más correos por ahora (límite del plan). Los correos que faltaban quedaron sin enviar: reintentalos con «Reintentar fallidos» cuando se renueve el límite.";

export const DEVELOPMENT_BANNER_TEXT =
  "Simulado (desarrollo): no se envió ningún correo.";

/** "No avanza desde las 10:12 AM." */
export function stalledBannerText(since: Date) {
  return `No avanza desde las ${reportTimeLabel(since)}.`;
}

/** F6: "Retirado el dom, 25 oct, 11:02 AM por Dennis · Motivo: «…»". */
export function retractedBannerText(input: {
  moment: string;
  by: string | null;
  reason: string | null;
}) {
  const head = input.by
    ? `Retirado el ${input.moment} por ${input.by}`
    : `Retirado el ${input.moment}`;
  return input.reason ? `${head} · Motivo: «${input.reason}»` : head;
}

/**
 * "Enviado en un entorno de prueba: las listas se reemplazaron por los 4
 * administradores."
 */
export function stagingBannerText(stagingAdmins: number) {
  const admins =
    stagingAdmins === 1
      ? "1 administrador"
      : `los ${fmt(stagingAdmins)} administradores`;
  return `Enviado en un entorno de prueba: las listas se reemplazaron por ${admins}.`;
}
