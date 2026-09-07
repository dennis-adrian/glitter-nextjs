export const RESERVATION_ERROR_CODES = [
  "UNAUTHENTICATED",
  "UNAUTHORIZED",
  "PROFILE_NOT_VERIFIED",
  "FESTIVAL_NOT_ACTIVE",
  "RESERVATIONS_NOT_OPEN",
  "NOT_ENROLLED",
  "TERMS_UNAVAILABLE",
  "TERMS_STALE",
  "SANCTION_BLOCKED",
  "RESERVATION_REJECTED",
  "STAND_NOT_FOUND",
  "STAND_WRONG_FESTIVAL",
  "STAND_NOT_ELIGIBLE",
  "STAND_UNAVAILABLE",
  "HOLD_EXPIRED",
  "HOLD_NOT_OWNED",
  "PARTNER_NOT_ELIGIBLE",
  "PARTNER_ALREADY_RESERVED",
  "ALREADY_RESERVED",
  "CONFLICT_RETRY",
  "INVOICE_NOT_OWNED",
  "INVOICE_NOT_PENDING",
  "PAYMENT_ALREADY_SUBMITTED",
  "PAYMENT_AMOUNT_MISMATCH",
  "INSUFFICIENT_CREDITS",
  "CREDIT_TOP_UP_UNDER_REVIEW",
  "CREDIT_TOP_UP_NOT_NEEDED",
  "FULL_TABLE_CATEGORY_INELIGIBLE",
  "FULL_TABLE_UNAVAILABLE",
  "FULL_TABLE_NONE_COMPLETE",
  "FULL_TABLE_INSUFFICIENT_CREDITS",
  "FULL_TABLE_ACCESS_INACTIVE",
  "FULL_TABLE_NOT_DOWNGRADABLE",
  "FULL_TABLE_HOLD_ACTIVE",
  "RELEASE_UNAVAILABLE",
  "RELEASE_NOT_PENDING",
  "RELEASE_INSUFFICIENT_CREDITS",
  "RELEASE_INVOICE_SETTLED",
  "LATE_PARTNER_UNAVAILABLE",
  "LATE_PARTNER_DEADLINE_PASSED",
  "LATE_PARTNER_ALREADY_SHARED",
  "LATE_PARTNER_NOT_PRICEABLE",
  "LATE_PARTNER_INSUFFICIENT_CREDITS",
  "VALIDATION",
] as const;

export type ReservationErrorCode = (typeof RESERVATION_ERROR_CODES)[number];

export const RESERVATION_ERROR_MESSAGES: Record<ReservationErrorCode, string> =
  {
    UNAUTHENTICATED: "Tenés que iniciar sesión para continuar.",
    UNAUTHORIZED: "No estás autorizado para realizar esta acción.",
    PROFILE_NOT_VERIFIED:
      "Tu perfil todavía no está verificado. No podés reservar hasta que te habiliten.",
    FESTIVAL_NOT_ACTIVE:
      "Las reservas no están disponibles para este festival.",
    RESERVATIONS_NOT_OPEN:
      "Vas a poder reservar cuando se habilite el período.",
    NOT_ENROLLED: "No estás habilitado para participar en este festival.",
    TERMS_UNAVAILABLE:
      "Los términos todavía no están disponibles. Volvé a intentar más tarde.",
    TERMS_STALE: "Aceptá la versión actual de los términos para reservar.",
    SANCTION_BLOCKED:
      "No podés reservar en este festival por una sanción activa.",
    RESERVATION_REJECTED:
      "Tu reserva en este festival fue cancelada. No podés volver a participar.",
    STAND_NOT_FOUND: "Este espacio no existe.",
    STAND_WRONG_FESTIVAL: "El espacio no pertenece a este festival.",
    STAND_NOT_ELIGIBLE:
      "Este espacio no corresponde a tu categoría de participación.",
    STAND_UNAVAILABLE: "Este espacio ya no está disponible.",
    HOLD_EXPIRED:
      "Tu reserva temporal expiró. Volvé al mapa para seleccionar otro espacio.",
    HOLD_NOT_OWNED: "Esta reserva temporal no te pertenece.",
    PARTNER_NOT_ELIGIBLE:
      "La persona que elegiste no puede participar en esta reserva.",
    PARTNER_ALREADY_RESERVED:
      "La persona que elegiste ya tiene una reserva en este festival.",
    ALREADY_RESERVED: "Ya tenés una reserva vigente en este festival.",
    CONFLICT_RETRY:
      "Otro cambio ocurrió al mismo tiempo. Actualizá e intentá de nuevo.",
    INVOICE_NOT_OWNED:
      "Solo quien figura en la factura puede enviar el comprobante.",
    INVOICE_NOT_PENDING: "Esta factura ya no admite un comprobante nuevo.",
    PAYMENT_ALREADY_SUBMITTED:
      "Ya enviamos un comprobante para esta factura. Esperá la revisión.",
    PAYMENT_AMOUNT_MISMATCH:
      "El importe del comprobante no coincide con el saldo pendiente.",
    INSUFFICIENT_CREDITS:
      "No tenés créditos confirmados suficientes para cubrir este pago.",
    CREDIT_TOP_UP_UNDER_REVIEW:
      "Ya tenés una compra de créditos en revisión para este pago. Esperá la confirmación.",
    CREDIT_TOP_UP_NOT_NEEDED:
      "Tus créditos disponibles ya cubren el saldo. Usalos desde el resumen del pago.",
    FULL_TABLE_CATEGORY_INELIGIBLE:
      "La mesa completa está disponible solo para ilustración y emprendimiento.",
    FULL_TABLE_UNAVAILABLE:
      "La mesa completa no está habilitada en este festival.",
    FULL_TABLE_NONE_COMPLETE:
      "Por ahora no queda ninguna mesa con las dos mitades libres.",
    FULL_TABLE_INSUFFICIENT_CREDITS:
      "No te alcanzan los créditos para activar la mesa completa. Comprá la diferencia y volvé.",
    FULL_TABLE_ACCESS_INACTIVE:
      "No tenés la mesa completa activada en este festival.",
    // Two causes, one code: the reservation is not a full table, or its
    // invoice already has money against it. Both mean the same thing to an
    // admin — there is nothing safe to reduce here — and naming only the first
    // sent them looking for a second space that was never the problem.
    FULL_TABLE_NOT_DOWNGRADABLE:
      "Esta reserva no se puede reducir: o no ocupa dos espacios, o su factura ya tiene pagos o créditos aplicados.",
    FULL_TABLE_HOLD_ACTIVE:
      "Tenés una mesa completa en espera. Cancelá esa selección antes de desactivarla.",
    RELEASE_UNAVAILABLE:
      "Liberar reservas no está habilitado en este festival.",
    // Named for what the participant can see rather than for the status: they
    // know whether they have paid, not what the row says.
    RELEASE_NOT_PENDING:
      "Solo podés liberar una reserva que todavía no pagaste.",
    RELEASE_INSUFFICIENT_CREDITS:
      "No te alcanzan los créditos para liberar la reserva. Comprá la diferencia y volvé.",
    RELEASE_INVOICE_SETTLED:
      "Esta reserva ya tiene un pago registrado. Escribinos y lo resolvemos.",
    LATE_PARTNER_UNAVAILABLE:
      "Agregar un compañero no está disponible para esta reserva.",
    LATE_PARTNER_DEADLINE_PASSED:
      "Ya pasó la fecha límite para agregar un compañero a tu reserva.",
    LATE_PARTNER_ALREADY_SHARED: "Tu reserva ya tiene un compañero.",
    // The reservation was booked without a shared price on record, so there is
    // no agreed figure for what two people cost.
    LATE_PARTNER_NOT_PRICEABLE:
      "No podemos calcular el precio compartido de esta reserva. Escribinos y lo resolvemos.",
    LATE_PARTNER_INSUFFICIENT_CREDITS:
      "No te alcanzan los créditos para agregar un compañero. Comprá la diferencia y volvé.",
    VALIDATION: "Los datos enviados no son válidos. Revisá e intentá de nuevo.",
  };

export type ReservationActionResult<T = undefined> =
  | { success: true; data: T; message: string }
  | { success: false; code: ReservationErrorCode; message: string };

export function reservationFailure(
  code: ReservationErrorCode,
  message?: string,
): Extract<ReservationActionResult, { success: false }> {
  return {
    success: false,
    code,
    message: message ?? RESERVATION_ERROR_MESSAGES[code],
  };
}

export function reservationSuccess<T>(
  data: T,
  message: string,
): Extract<ReservationActionResult<T>, { success: true }> {
  return { success: true, data, message };
}
