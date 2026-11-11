import type { NotificationLogStatus } from "@/app/lib/notifications/admin-log-definitions";

/**
 * "Reenviar correo" on the admin notification log: one failed transactional
 * email sent again as a new delivery row. Shared by the server code, the
 * action and the log's client components, so nothing here imports server
 * code.
 *
 * Only `notification_deliveries` rows qualify: channel `email`, lane
 * `transactional`, status `failed`. Bulk rows never do (a bulk row that may
 * have reached Resend keeps its key and is never retried by hand; comunicados
 * have "Reintentar fallidos"), and neither do the two outboxes, which have no
 * retry of their own.
 */

/** Why the server would not send it again. */
export const NOTIFICATION_RESEND_REFUSALS = {
  NOT_FOUND: "No encontramos este envío. Recargá la página.",
  NOT_ELIGIBLE:
    "Solo se puede reenviar un correo individual que falló. Los envíos masivos se reintentan desde el reporte del comunicado.",
  RESEND_PENDING: "Ya hay un reenvío de este correo en camino.",
  RESEND_SENT: "Este correo ya se reenvió y Resend lo aceptó.",
  RESEND_DONE:
    "Este correo ya se reenvió y ese reenvío tampoco salió: reenviá desde la fila del reenvío.",
  NO_ACCOUNT:
    "La cuenta de esta persona ya no existe: no le reenviamos el correo.",
  DELETING: "La cuenta de esta persona se está eliminando.",
  EMAIL_CHANGED:
    "Esta persona cambió su correo desde este envío: no lo reenviamos a la dirección anterior.",
  RETRACTED: "El aviso en la app fue retirado: su correo ya no se reenvía.",
  REVOKED: "El regalo se retiró: su aviso ya no se reenvía.",
  SUPPRESSED:
    "Esta dirección está bloqueada porque rebotó o la marcaron como spam. Desbloqueala en Correos bloqueados y volvé a intentarlo.",
  RENDER_UNAVAILABLE:
    "Este correo ya no se puede armar con los datos guardados, así que no se puede reenviar.",
} as const;

export type NotificationResendRefusalCode =
  keyof typeof NOTIFICATION_RESEND_REFUSALS;

/** What the log shows about resending one row. */
export type NotificationLogResend = {
  /**
   * The row could be sent again: a failed transactional email that nobody
   * resent yet. The server checks everything else when asked.
   */
  eligible: boolean;
  /** This row is a resend: the admin who asked for it, when known. */
  requestedBy: { userId: number; name: string | null } | null;
  /** The newest row that sent this one again. */
  resentAs: {
    deliveryId: number;
    status: NotificationLogStatus;
    at: Date;
    by: { userId: number; name: string | null } | null;
  } | null;
};

/** The structural half of eligibility; the server adds "nobody resent it". */
export function isResendableDelivery(row: {
  source: string;
  channel: string;
  lane: string | null;
  status: string;
}) {
  return (
    row.source === "delivery" &&
    row.channel === "email" &&
    row.lane === "transactional" &&
    row.status === "failed"
  );
}

/** The idempotency key of the one resend a failed row may have. */
export function notificationResendKey(deliveryId: number) {
  return `notification-delivery:${deliveryId}:admin-resend`;
}
