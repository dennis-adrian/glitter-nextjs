import type { NotificationLogChannel } from "@/app/lib/notifications/admin-log-definitions";

/**
 * Plain-Spanish readings of the codes the senders store in `last_error`, for
 * the admin notification log. Client-safe: the table renders them.
 *
 * The codes come from `push/result.ts` (`push_<status>`, with Apple's reason
 * after a colon when it gave one, `push_network`, `push_timeout`), `push/send.ts` (skip reasons, `endpoint_rejected`),
 * `deliveries.ts` and `bulk-email.ts` (email codes, `resend:<name>`) and the
 * comunicado renderers. The older outboxes store free-form messages; those,
 * and any code missing here, get no reading and are shown as stored.
 */

export type NotificationLogErrorReading = {
  /** What happened, in a sentence an admin can act on. */
  summary: string;
  /** What we did about it, or what to check. */
  hint?: string;
};

const NOT_RETRIED = "No se reintenta.";

/** Push service answers by HTTP status (`push_<status>`). */
function pushStatusReading(status: number): NotificationLogErrorReading {
  if (status === 404 || status === 410) {
    return {
      summary: `El dispositivo ya no recibe avisos (${status}).`,
      hint: "La persona desactivó los avisos, desinstaló la app o borró los datos del sitio. Quitamos el dispositivo de su cuenta.",
    };
  }
  if (status === 400) {
    return {
      summary: "El servicio push rechazó el aviso (400).",
      hint: `${NOT_RETRIED} El dispositivo se conserva. Si se repite siempre en el mismo dispositivo, puede ayudar que la persona desactive y vuelva a activar los avisos ahí. Si aparece en muchos dispositivos a la vez, revisá la configuración de avisos push.`,
    };
  }
  if (status === 401 || status === 403) {
    return {
      summary: `El servicio push no aceptó nuestra firma (${status}).`,
      hint: `${NOT_RETRIED} Suele ser un problema con las claves VAPID del servidor, no del dispositivo.`,
    };
  }
  if (status === 413) {
    return {
      summary: "El aviso era demasiado grande para el servicio push (413).",
      hint: NOT_RETRIED,
    };
  }
  if (status === 429) {
    return {
      summary: "El servicio push pidió esperar (429).",
      hint: "Estábamos enviando demasiados avisos a la vez.",
    };
  }
  if (status === 408 || status >= 500) {
    return {
      summary: `Falla temporal del servicio push (${status}).`,
      hint: "Se reintentó varias veces antes de darlo por fallido.",
    };
  }
  return {
    summary: `El servicio push rechazó el aviso (${status}).`,
    hint: `${NOT_RETRIED} El dispositivo se conserva.`,
  };
}

const OUR_REQUEST =
  "Es un problema de cómo armamos el aviso, no del dispositivo.";
const OUR_SIGNATURE =
  "Revisá las claves VAPID y el reloj del servidor: no es un problema del dispositivo.";
const APPLE_SIDE =
  "Es una falla del lado de Apple; se reintentó antes de darlo por fallido.";

/**
 * What Apple's push service means by each reason it answers with. Apple
 * documents these identifiers for its push API; one missing here is still
 * shown, by name.
 */
const APPLE_REASONS: Record<string, string> = {
  BadDeviceToken: `Apple dice que la suscripción de este dispositivo no es válida. ${NOT_RETRIED} Que la persona desactive y vuelva a activar los avisos en ese dispositivo crea una suscripción nueva.`,
  Unregistered: "El dispositivo se dio de baja de los avisos en Apple.",
  ExpiredToken: "La suscripción de este dispositivo venció en Apple.",
  BadJwtToken: `Apple no aceptó nuestra firma. ${OUR_SIGNATURE}`,
  InvalidProviderToken: `Apple no aceptó nuestra firma. ${OUR_SIGNATURE}`,
  ExpiredProviderToken: `Apple consideró vencida nuestra firma. ${OUR_SIGNATURE}`,
  MissingProviderToken: `El aviso salió sin firma. ${OUR_SIGNATURE}`,
  BadExpirationDate: `Apple no aceptó el vencimiento (TTL) del aviso. ${OUR_REQUEST}`,
  BadPriority: `Apple no aceptó la urgencia del aviso. ${OUR_REQUEST}`,
  BadTopic: `Apple no aceptó el tema (Topic) del aviso. ${OUR_REQUEST}`,
  MissingTopic: `Apple pidió un tema (Topic) que el aviso no tenía. ${OUR_REQUEST}`,
  BadWebPushTopic: `Apple no aceptó el tema (Topic) del aviso. ${OUR_REQUEST}`,
  BadMessageId: `Apple no aceptó el identificador del aviso. ${OUR_REQUEST}`,
  DuplicateHeaders: `El aviso salió con encabezados repetidos. ${OUR_REQUEST}`,
  PayloadEmpty: `El aviso salió vacío. ${OUR_REQUEST}`,
  PayloadTooLarge: `El aviso era demasiado grande para Apple. ${OUR_REQUEST}`,
  TopicDisallowed:
    "Apple no permite avisos con este tema para esta suscripción.",
  DeviceTokenNotForTopic:
    "Apple dice que esta suscripción no corresponde a nuestro sitio.",
  Forbidden: "Apple no permitió el envío.",
  TooManyRequests: "Apple pidió bajar el ritmo de avisos a este dispositivo.",
  TooManyProviderTokenUpdates:
    "Apple pidió renovar nuestra firma con menos frecuencia.",
  InternalServerError: APPLE_SIDE,
  ServiceUnavailable: APPLE_SIDE,
  Shutdown: APPLE_SIDE,
};

/** A push status reading, made specific by the provider's reason if any. */
function pushReading(
  status: number,
  reason: string | undefined,
): NotificationLogErrorReading {
  const reading = pushStatusReading(status);
  if (!reason) return reading;
  // Own keys only: a reason like "constructor" must not read the prototype.
  const meaning = Object.prototype.hasOwnProperty.call(APPLE_REASONS, reason)
    ? APPLE_REASONS[reason]
    : undefined;
  return {
    summary: reading.summary,
    hint: meaning
      ? `Motivo: ${reason}. ${meaning}`
      : `Motivo que dio el servicio push: ${reason}. ${reading.hint ?? ""}`.trim(),
  };
}

/** Codes that mean the same on every channel. */
const SHARED: Record<string, NotificationLogErrorReading> = {
  retracted: { summary: "Se retiró antes de enviarse." },
  deleting: { summary: "Se está borrando el perfil de la persona." },
};

const PUSH: Record<string, NotificationLogErrorReading> = {
  push_network: {
    summary: "No pudimos conectar con el servicio push.",
    hint: "Se reintentó varias veces antes de darlo por fallido.",
  },
  push_timeout: {
    summary: "El servicio push no respondió a tiempo.",
    hint: "Se reintentó varias veces antes de darlo por fallido.",
  },
  endpoint_rejected: {
    summary:
      "La dirección del dispositivo no es de un servicio push permitido.",
    hint: "Quitamos el dispositivo de su cuenta.",
  },
  expired: {
    summary: "Pasó demasiado tiempo: el aviso ya no tenía sentido.",
  },
  no_device: {
    summary: "El dispositivo se quitó o ahora es de otra cuenta.",
  },
  no_notification: { summary: "La notificación ya no existe." },
  archived: {
    summary: "La persona la archivó antes de que saliera el aviso.",
  },
  read: { summary: "La persona ya la había leído en la app." },
  not_visible: {
    summary: "Era para administración y la persona ya no es admin.",
  },
  push_off: {
    summary: "Los avisos push no están habilitados para esta persona.",
  },
};

const EMAIL: Record<string, NotificationLogErrorReading> = {
  suppressed: {
    summary: "El correo está bloqueado por un rebote o un reporte de spam.",
    hint: "Se ve en Correos bloqueados.",
  },
  unsubscribed: {
    summary: "La persona se dio de baja de este tipo de correo.",
  },
  revoked: { summary: "El regalo se retiró antes de enviar el correo." },
  no_recipient: { summary: "No había dirección de correo." },
  invalid_address: { summary: "La dirección de correo no es válida." },
  address_changed: {
    summary: "La persona cambió de correo antes del envío.",
  },
  not_eligible: { summary: "Ya no le correspondía recibirlo." },
  staging: { summary: "No se envía desde el entorno de pruebas." },
  expired: { summary: "Venció antes de enviarse." },
  render_unavailable: {
    summary: "No se pudo armar el correo con los datos guardados.",
    hint: NOT_RETRIED,
  },
  outcome_unknown: {
    summary: "No sabemos si Resend lo aceptó.",
    hint: "Resend no respondió con claridad. No se reintenta, para no enviarlo dos veces.",
  },
  timeout: {
    summary: "Resend no respondió a tiempo.",
  },
  "resend:item_rejected": {
    summary: "Resend rechazó esta dirección dentro del envío masivo.",
  },
  "resend:rate_limit_exceeded": {
    summary: "Resend pidió esperar: límite de envíos por segundo.",
  },
  "resend:daily_quota_exceeded": {
    summary: "Se agotó la cuota diaria de Resend.",
  },
  "resend:monthly_quota_exceeded": {
    summary: "Se agotó la cuota mensual de Resend.",
  },
  "resend:validation_error": {
    summary: "Resend rechazó el correo por datos inválidos.",
  },
  "resend:empty_response": {
    summary: "Resend respondió sin decir si lo aceptó.",
  },
};

const RESEND_CONFIG = new Set([
  "invalid_api_key",
  "missing_api_key",
  "restricted_api_key",
  "invalid_from_address",
  "security_error",
]);

/** A reading for a stored error, or null when it has none: show it as stored. */
export function describeNotificationLogError(
  error: string,
  channel: NotificationLogChannel,
): NotificationLogErrorReading | null {
  const code = error.trim();
  if (Object.prototype.hasOwnProperty.call(SHARED, code)) return SHARED[code]!;

  if (channel === "push") {
    const status = /^push_(\d{3})(?::([A-Za-z]{1,40}))?$/.exec(code);
    if (status) return pushReading(Number(status[1]), status[2]);
    return Object.prototype.hasOwnProperty.call(PUSH, code)
      ? PUSH[code]!
      : null;
  }

  if (channel === "email") {
    if (Object.prototype.hasOwnProperty.call(EMAIL, code)) return EMAIL[code]!;
    const resend = /^resend:([a-z_]+)$/.exec(code);
    if (resend) {
      return RESEND_CONFIG.has(resend[1]!)
        ? {
            summary: "Problema de configuración de Resend.",
            hint: "Revisá la clave de API y el remitente.",
          }
        : { summary: "Resend rechazó el envío." };
    }
  }
  return null;
}
