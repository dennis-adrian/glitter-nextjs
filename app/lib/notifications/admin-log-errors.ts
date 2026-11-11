/**
 * The admin notification log's error column in words: what a stored
 * `last_error` means for the recipient, and whether it was retried or is
 * final. Client-safe and pure.
 *
 * Every code here is one the code writes today:
 * - push deliveries: `push/result.ts` (`push_<status>`, `push_network`,
 *   `push_timeout`) and `push/send.ts` (`endpoint_rejected`, skip and
 *   release reasons);
 * - email deliveries: `deliveries.ts` (`no_recipient`, `suppressed`,
 *   `render_unavailable`, `revoked`, `resend:<code>`) and `bulk-email.ts`
 *   with its pre-checks in `comunicados/` and `festivals/`;
 * - the reservation outbox's thrown codes (`reservations/notification-outbox.ts`)
 *   and the disciplinary outbox's `profile_deleted`.
 *
 * Anything else (free text from an outbox) is shown as stored, after
 * `redactNotificationLogError` took out what must not reach the browser.
 */

type ErrorContext = {
  channel: "in_app" | "email" | "push";
  lane: "transactional" | "bulk" | null;
};

const RETRIED_THEN_FAILED =
  "Se reintenta solo; quedó como fallido al agotarse los intentos.";
const NOT_SENT_FINAL = "No se envió y no se reintenta.";
const PUSH_REJECTED_FINAL =
  "No le llegó el aviso; no se reintenta y el dispositivo se conserva.";
const OUTBOX_DATA_MISSING = `No se pudo armar el correo. ${RETRIED_THEN_FAILED}`;

/** Codes whose meaning does not depend on the channel or lane. */
const FIXED: Record<string, string> = {
  // Push: push/result.ts and push/send.ts.
  push_400: `El servicio push rechazó la solicitud. ${PUSH_REJECTED_FINAL}`,
  push_401: `El servicio push rechazó la firma del servidor; suele ser un problema con las claves VAPID. ${PUSH_REJECTED_FINAL}`,
  push_403: `El servicio push rechazó la firma del servidor; suele ser un problema con las claves VAPID. ${PUSH_REJECTED_FINAL}`,
  push_404:
    "Es normal: el dispositivo dio de baja su suscripción (se desinstaló la app, se borraron sus datos o se quitó el permiso). Se quitó de la cuenta y no se reintenta; la notificación sigue en la app.",
  push_408: `El servicio push no respondió a tiempo (falla temporal). ${RETRIED_THEN_FAILED}`,
  push_410:
    "Es normal: el dispositivo dio de baja su suscripción (se desinstaló la app, se borraron sus datos o se quitó el permiso). Se quitó de la cuenta y no se reintenta; la notificación sigue en la app.",
  push_413: `El aviso era demasiado grande para el servicio push. ${PUSH_REJECTED_FINAL}`,
  push_429: `El servicio push pidió bajar el ritmo de envíos. ${RETRIED_THEN_FAILED}`,
  push_network: `No se pudo conectar con el servicio push (falla de red temporal). ${RETRIED_THEN_FAILED}`,
  push_timeout: `El servicio push tardó demasiado en responder (falla temporal). ${RETRIED_THEN_FAILED}`,
  endpoint_rejected:
    "La dirección del dispositivo no es de un servicio push permitido. No le llegó el aviso; se quitó el dispositivo y no se reintenta.",
  no_device: `El dispositivo ya no existe o ahora es de otra cuenta. ${NOT_SENT_FINAL}`,
  no_notification: `La notificación en la app ya no existe, así que el aviso no tenía qué abrir. ${NOT_SENT_FINAL}`,
  archived: `La notificación se archivó (o se borró con el perfil) antes del aviso. ${NOT_SENT_FINAL}`,
  read: `La persona ya la había leído en la app y el aviso habría llegado tarde. ${NOT_SENT_FINAL}`,
  not_visible: `Era un aviso de administración y la persona ya no es admin. ${NOT_SENT_FINAL}`,
  push_off: `Los avisos push están desactivados para esta persona. ${NOT_SENT_FINAL}`,
  unconfigured:
    "Este servidor no tiene claves VAPID; el aviso queda para otro servidor que las tenga.",
  key_mismatch:
    "El dispositivo se suscribió con las claves VAPID de otro entorno; el aviso queda para el servidor que las tiene.",

  // Either channel.
  retracted: `Se retiró la notificación antes de enviarla. ${NOT_SENT_FINAL}`,
  revoked: `Se retiró el regalo de créditos antes del envío. ${NOT_SENT_FINAL}`,
  deleting: `El perfil de la persona se está eliminando. ${NOT_SENT_FINAL}`,

  // Email: deliveries.ts, bulk-email.ts and the bulk pre-checks.
  no_recipient: `No había dirección de correo. ${NOT_SENT_FINAL}`,
  suppressed:
    "La dirección está bloqueada por un rebote o un reporte de spam (ver Correos bloqueados). No se envió y no se reintenta.",
  bounced: `Un correo anterior a esta dirección rebotó. ${NOT_SENT_FINAL}`,
  opted_out: `La persona se dio de baja de estos correos o reportó uno como spam. ${NOT_SENT_FINAL}`,
  unsubscribed: `La persona se dio de baja de estos correos. ${NOT_SENT_FINAL}`,
  invalid_address: `La dirección de correo no es válida. ${NOT_SENT_FINAL}`,
  not_eligible: `La persona ya no cumple las condiciones para recibirlo (su cuenta o su estado cambió). ${NOT_SENT_FINAL}`,
  staging:
    "Entorno de prueba: solo se envía a admins o a personas elegidas una por una. No se envió.",
  address_changed:
    "La persona cambió su correo después de que se encoló. No se envió a la dirección anterior; en un comunicado se puede reintentar a la actual desde su reporte.",
  render_unavailable: `No se pudo armar el correo con los datos guardados. ${NOT_SENT_FINAL}`,
  render_failed: `Falló al armar el correo. ${RETRIED_THEN_FAILED}`,
  outcome_unknown:
    "No sabemos si llegó: un intento pudo llegar a Resend sin confirmación. No se reintenta, para no mandarlo dos veces.",
  timeout:
    "Resend no respondió a tiempo y el correo pudo haber llegado. Se reintenta con la misma clave, así no llega dos veces.",
  "Resend request timed out": `Resend no respondió a tiempo. ${RETRIED_THEN_FAILED}`,
  "resend:empty_response":
    "Resend respondió sin confirmar el envío; el correo pudo haber llegado. Se reintenta con la misma clave.",
  "resend:item_rejected":
    "Resend rechazó este correo dentro del envío masivo (suele ser por la dirección). No le llegó y no se reintenta solo.",

  // Reservation outbox: what `notification-outbox.ts` throws.
  reservation_missing: `La reserva ya no existe. ${OUTBOX_DATA_MISSING}`,
  reservation_id_missing: `El correo no indica a qué reserva corresponde. ${OUTBOX_DATA_MISSING}`,
  rejection_recipient_missing: `La persona ya no figura en la reserva. ${OUTBOX_DATA_MISSING}`,
  release_recipient_missing: `La persona ya no figura en la reserva. ${OUTBOX_DATA_MISSING}`,
  extension_recipient_missing: `La persona ya no figura en la reserva. ${OUTBOX_DATA_MISSING}`,
  late_partner_recipient_missing: `La persona ya no figura en la reserva. ${OUTBOX_DATA_MISSING}`,
  late_partner_owner_missing: `Falta el titular de la reserva. ${OUTBOX_DATA_MISSING}`,
  late_partner_partner_missing: `Falta el compañero agregado a la reserva. ${OUTBOX_DATA_MISSING}`,
  release_owner_missing: `Falta quien liberó la reserva. ${OUTBOX_DATA_MISSING}`,
  enrollment_payload_missing: `Faltan los datos guardados de la inscripción. ${OUTBOX_DATA_MISSING}`,
  enrollment_context_missing: `La inscripción o el perfil ya no existen. ${OUTBOX_DATA_MISSING}`,
  credit_payload_missing: `Faltan los datos guardados de la recarga. ${OUTBOX_DATA_MISSING}`,
  credit_top_up_missing: `La recarga de créditos ya no existe. ${OUTBOX_DATA_MISSING}`,
  credit_profile_missing: `El perfil de la persona ya no existe. ${OUTBOX_DATA_MISSING}`,
  send_failed: `Falló el envío por un error sin detalle. ${RETRIED_THEN_FAILED}`,

  // Disciplinary outbox.
  profile_deleted: `El perfil de la persona se eliminó antes del envío. ${NOT_SENT_FINAL}`,

  // What `redactNotificationLogError` leaves of a hidden message.
  "Failed query":
    "Falló una consulta a la base de datos (el detalle se oculta: puede traer datos personales).",
  "Payload de notificación inválido":
    "Los datos guardados del correo no son válidos (el detalle se oculta).",
};

const RESEND_CONFIG = new Set([
  "invalid_api_key",
  "missing_api_key",
  "restricted_api_key",
  "invalid_from_address",
  "security_error",
]);
const RESEND_QUOTA = new Set([
  "daily_quota_exceeded",
  "monthly_quota_exceeded",
]);
const RESEND_INVALID = new Set([
  "validation_error",
  "invalid_parameter",
  "missing_required_field",
  "invalid_attachment",
]);
const RESEND_SERVER = new Set(["application_error", "internal_server_error"]);

/**
 * A Resend error name, as `resend:<name>` (the deliveries) or `<name>: …`
 * (an outbox, which stores the thrown `EmailSendError` message).
 */
function resendCode(error: string): string | null {
  const stored = /^resend:([a-z_]+)$/i.exec(error);
  if (stored) return stored[1]!;
  const thrown = /^([a-z_]+): /i.exec(error);
  if (
    thrown &&
    (RESEND_CONFIG.has(thrown[1]!) ||
      RESEND_QUOTA.has(thrown[1]!) ||
      RESEND_INVALID.has(thrown[1]!) ||
      RESEND_SERVER.has(thrown[1]!) ||
      thrown[1] === "rate_limit_exceeded" ||
      thrown[1] === "concurrent_idempotent_requests")
  ) {
    return thrown[1]!;
  }
  return null;
}

function resendExplanation(code: string, context: ErrorContext): string {
  const bulk = context.lane === "bulk";
  if (code === "rate_limit_exceeded") {
    return `Resend pidió bajar el ritmo de envíos. ${RETRIED_THEN_FAILED}`;
  }
  if (RESEND_QUOTA.has(code)) {
    const period = code.startsWith("daily") ? "diario" : "mensual";
    return bulk
      ? `Se agotó el cupo ${period} de envíos de Resend. No le llegó y no se reintenta solo; en un comunicado se puede reintentar desde su reporte cuando se renueve el cupo.`
      : `Se agotó el cupo ${period} de envíos de Resend. ${RETRIED_THEN_FAILED}`;
  }
  if (RESEND_CONFIG.has(code)) {
    return `Resend rechazó nuestra clave o el remitente: es un problema de configuración, no de la persona. ${RETRIED_THEN_FAILED}`;
  }
  if (RESEND_SERVER.has(code)) {
    return `Falla interna de Resend. ${RETRIED_THEN_FAILED}`;
  }
  if (code === "concurrent_idempotent_requests") {
    return `Otro intento del mismo correo seguía en curso. ${RETRIED_THEN_FAILED}`;
  }
  if (RESEND_INVALID.has(code)) {
    return `Resend rechazó el correo por datos inválidos (suele ser la dirección). ${RETRIED_THEN_FAILED}`;
  }
  return `Resend rechazó el correo. ${RETRIED_THEN_FAILED}`;
}

/**
 * What a stored error means, in Spanish, or null when it is not a known
 * code: the caller then shows the stored text.
 */
export function notificationLogErrorExplanation(
  error: string,
  context: ErrorContext,
): string | null {
  const code = error.trim();
  if (code === "expired") {
    return context.channel === "push"
      ? "Pasaron 48 horas sin poder enviarlo y un aviso tan tardío ya no sirve. No se envió y no se reintenta."
      : "Pasaron 20 horas en cola sin enviarse y ya no se intenta, para no arriesgar un correo duplicado.";
  }
  if (Object.prototype.hasOwnProperty.call(FIXED, code)) return FIXED[code]!;

  const push = /^push_(\d{3})$/.exec(code);
  if (push) {
    const status = Number(push[1]);
    if (status >= 500) {
      return `El servicio push tuvo una falla temporal de su lado. ${RETRIED_THEN_FAILED}`;
    }
    return `El servicio push rechazó el aviso (código HTTP ${status}). ${PUSH_REJECTED_FINAL}`;
  }

  if (code.startsWith("unsupported_kind:")) {
    return "El tipo de correo no se reconoce y no se puede enviar. Quedó como fallido al agotarse los intentos.";
  }

  const resend = resendCode(code);
  if (resend) return resendExplanation(resend, context);
  return null;
}

// Free text from an outbox can quote the request: a query's parameters, an
// address, a URL (a push endpoint is one), or a key.
const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi;
const EMAIL_PATTERN = /[^\s@"'<>(),;:]+@[^\s@"'<>(),;:]+\.[^\s@"'<>(),;:]+/g;
/** Long runs of letters and digits mixed: keys, tokens, endpoint ids. */
const TOKEN_PATTERN = /[A-Za-z0-9_+/=-]{24,}/g;

/**
 * A stored error as it may be shown to an admin's browser. Known codes pass
 * through. A database error keeps only "Failed query" (its SQL and params
 * can carry anything a row holds), an invalid payload keeps only its prefix,
 * a JSON dump is hidden, and URLs, addresses and key-like tokens are masked.
 */
export function redactNotificationLogError(value: string): string {
  const text = value.trim();
  if (/^Failed query:/i.test(text)) return "Failed query";
  if (text.startsWith("Payload de notificación inválido")) {
    return "Payload de notificación inválido";
  }
  if (text.startsWith("{") || text.startsWith("[")) return "[detalle oculto]";
  return text
    .replace(URL_PATTERN, "[url]")
    .replace(EMAIL_PATTERN, "[correo]")
    .replace(TOKEN_PATTERN, (token) =>
      /\d/.test(token) && /[A-Za-z]/.test(token) ? "[oculto]" : token,
    );
}
