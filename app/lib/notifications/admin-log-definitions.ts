import { z } from "zod";

/**
 * The admin log of notifications we sent: what it lists and what its URL may
 * say. Shared by the page, its queries and its client components, so nothing
 * here may import server code.
 *
 * Four tables feed it: `notifications` (inbox items), `notification_deliveries`
 * (emails and pushes, one row per device) and the two older outboxes that still
 * send their own emails, `reservation_notification_jobs` and
 * `disciplinary_notification_jobs`. Emails sent straight through `sendEmail`
 * leave no row anywhere, so they cannot be listed.
 */

export const NOTIFICATION_LOG_CHANNELS = ["in_app", "email", "push"] as const;
export type NotificationLogChannel = (typeof NOTIFICATION_LOG_CHANNELS)[number];

export const NOTIFICATION_LOG_CHANNEL_LABELS: Record<
  NotificationLogChannel,
  string
> = {
  in_app: "En la app",
  email: "Correo",
  push: "Aviso push",
};

/**
 * One vocabulary for every source. The outboxes say `completed` where the
 * deliveries say `sent`; both mean the provider took the message.
 */
export const NOTIFICATION_LOG_STATUSES = [
  "pending",
  "processing",
  "sent",
  "failed",
  "skipped",
] as const;
export type NotificationLogStatus = (typeof NOTIFICATION_LOG_STATUSES)[number];

/** For the filter, where one label covers every channel. */
export const NOTIFICATION_LOG_STATUS_LABELS: Record<
  NotificationLogStatus,
  string
> = {
  pending: "En cola",
  processing: "Enviando",
  sent: "Aceptado o en la bandeja",
  failed: "Falló",
  skipped: "Omitido",
};

/**
 * What `sent` means on each channel. Resend and the push services only say
 * they took the message: nobody tells us it arrived or was opened, so the
 * label never claims it.
 */
export function notificationLogStatusLabel(
  channel: NotificationLogChannel,
  status: NotificationLogStatus,
) {
  if (status !== "sent") return NOTIFICATION_LOG_STATUS_LABELS[status];
  if (channel === "in_app") return "En la bandeja";
  if (channel === "email") return "Aceptado por Resend";
  return "Aceptado por el servicio push";
}

/** Where a row was read from. Part of its key: ids repeat across tables. */
export type NotificationLogSource =
  | "inbox"
  | "delivery"
  | "reservation_outbox"
  | "disciplinary_outbox";

/**
 * Names for the kinds and email templates admins will meet. A key missing
 * here is shown as it is stored, which is still enough to tell rows apart.
 */
const KIND_LABELS: Record<string, string> = {
  credit_gift_received: "Regalo de créditos",
  credit_gift_revoked: "Regalo de créditos retirado",
  credit_gift_completed: "Resumen de regalo (admin)",
  comunicado: "Comunicado",
  comunicado_contact: "Comunicado a contacto sin cuenta",
  comunicado_not_sent: "Comunicado no enviado (admin)",
  festival_participant_invitation: "Invitación a festival",
  festival_reservations_open: "Reservas abiertas",
  festival_stands_available: "Espacios disponibles",
  infraction_registered: "Infracción registrada",
  infraction_edited: "Infracción editada",
  infraction_resolved: "Infracción resuelta",
  infraction_voided: "Infracción anulada",
  sanction_approved: "Sanción aplicada",
  sanction_edited: "Sanción editada",
  sanction_expired: "Sanción vencida",
  sanction_revoked: "Sanción revocada",
  sanction_reservation_access_enabled: "Acceso a reservas habilitado",
  // Inbox copies of the reservation outbox.
  reservation_proof_submitted: "Comprobante recibido",
  reservation_zero_value_review_requested: "Reserva sin costo en revisión",
  reservation_confirmed: "Reserva confirmada",
  reservation_cancelled: "Reserva cancelada",
  reservation_payment_deadline_extended: "Plazo de pago extendido",
  reservation_payment_reminder: "Recordatorio de pago",
  reservation_released: "Reserva liberada",
  reservation_partner_added: "Compañero agregado a la reserva",
  festival_participation_approved: "Participación aprobada",
  festival_participation_rejected: "Participación rechazada",
  credit_top_up_rejected: "Recarga de créditos rechazada",
  reservation_created_admin: "Reserva creada (admin)",
  reservation_proof_submitted_admin: "Comprobante recibido (admin)",
  reservation_zero_value_review_requested_admin:
    "Reserva sin costo por revisar (admin)",
  reservation_confirmed_with_credits_admin:
    "Reserva confirmada con créditos (admin)",
  // The reservation outbox's own email kinds.
  reservation_created: "Reserva creada",
  proof_submitted: "Comprobante recibido",
  zero_value_review_requested: "Reserva sin costo en revisión",
  settlement_approved: "Pago aprobado",
  settlement_rejected: "Pago rechazado",
  reservation_rejected: "Reserva rechazada",
  deadline_extended: "Plazo de pago extendido",
  late_partner_added: "Compañero agregado a la reserva",
};

export function notificationLogKindLabel(kind: string) {
  return KIND_LABELS[kind] ?? kind;
}

export function hasNotificationLogKindLabel(kind: string) {
  return Object.prototype.hasOwnProperty.call(KIND_LABELS, kind);
}

export type NotificationLogLink = { label: string; href: string };

export type NotificationLogRow = {
  /** `source:id`, unique across the four tables. */
  key: string;
  source: NotificationLogSource;
  id: number;
  channel: NotificationLogChannel;
  status: NotificationLogStatus;
  /** The notification kind, or the outbox's email kind. */
  kind: string;
  /**
   * The inbox title (an email or push of an inbox item carries the same
   * one), or the campaign's title for mail with no inbox copy. Null when
   * nothing stored says it, or when it is withheld (`reserved`).
   */
  title: string | null;
  /** Disciplinary notices: what they say is read on the case itself. */
  reserved: boolean;
  recipient: {
    userId: number | null;
    name: string | null;
    /** The address the email went to; the account's address otherwise. */
    email: string | null;
  };
  /** Push only: the device's own label, never its endpoint. */
  deviceLabel: string | null;
  /** Push only: the device was removed after the push was queued. */
  deviceRemoved: boolean;
  lane: "transactional" | "bulk" | null;
  attempts: number | null;
  /** What went wrong, or why it was skipped. */
  error: string | null;
  /** Queued, or written to the inbox. What the list is ordered by. */
  createdAt: Date;
  /** When the provider accepted it; equal to `createdAt` for the inbox. */
  sentAt: Date | null;
  readAt: Date | null;
  retractedAt: Date | null;
  /** An admin sent it again from a comunicado's report. */
  isResend: boolean;
  links: NotificationLogLink[];
};

export const NOTIFICATION_LOG_PAGE_SIZE = 25;

function multiValue<const T extends readonly string[]>(values: T) {
  return z
    .union([z.string(), z.array(z.string())])
    .optional()
    .catch(undefined)
    .transform((value): T[number][] =>
      value === undefined
        ? []
        : [
            ...new Set(
              (typeof value === "string" ? [value] : value).filter(
                (entry): entry is T[number] =>
                  (values as readonly string[]).includes(entry),
              ),
            ),
          ],
    );
}

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);

// Every field falls back instead of failing: an admin may edit or bookmark
// the URL, and a stale value should show the default list, not a 404. An
// empty channel or status list means every one.
export const NotificationLogSearchParamsSchema = z.object({
  query: z.string().trim().max(200).catch(""),
  channel: multiValue(NOTIFICATION_LOG_CHANNELS),
  status: multiValue(NOTIFICATION_LOG_STATUSES),
  from: isoDateSchema,
  to: isoDateSchema,
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(200)
    .catch(NOTIFICATION_LOG_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).catch(0),
  /** One account, matched exactly: what we sent to this person. */
  user: z.coerce
    .number()
    .int()
    .min(1)
    .max(2_147_483_647)
    .optional()
    .catch(undefined),
});
export type NotificationLogSearchParams = z.infer<
  typeof NotificationLogSearchParamsSchema
>;

export type NotificationLogPage = {
  rows: NotificationLogRow[];
  /** Rows matching the filters, across every page. */
  total: number;
};

export const NOTIFICATION_LOG_PATH = "/dashboard/notifications";

/** The log filtered to one account, as the admin profile links to it. */
export function notificationLogUserHref(userId: number) {
  return `${NOTIFICATION_LOG_PATH}?user=${userId}`;
}

/**
 * The same view without the person: every other filter stays, and the page
 * goes back to the first, since the count changes.
 */
export function notificationLogHrefWithoutUser(
  searchParams: Record<string, string | string[] | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "user" || key === "offset" || value === undefined) continue;
    for (const entry of typeof value === "string" ? [value] : value) {
      params.append(key, entry);
    }
  }
  const query = params.toString();
  return query ? `${NOTIFICATION_LOG_PATH}?${query}` : NOTIFICATION_LOG_PATH;
}

/** Who the log is filtered to, for the banner above it. */
export type NotificationLogPerson = {
  id: number;
  /** Null when no account has this id (any more). */
  name: string | null;
  email: string | null;
};
