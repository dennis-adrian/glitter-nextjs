export type ReservationEditStatus =
  | "pending"
  | "verification_payment"
  | "accepted"
  | "rejected";

export const COMBINED_SETTLEMENT_AND_PARTNER_MESSAGE =
  "No se puede cambiar el estado de la reserva al mismo tiempo que se cambia el compañero. Guardá cada cambio por separado.";

export const UNSUPPORTED_STATUS_MESSAGE =
  "El estado de pago se actualiza desde la revisión de comprobantes. Acá solo podés aceptar, rechazar o cambiar el compañero.";

export type ReservationEditSubmitPlan =
  | { kind: "reject" }
  | { kind: "confirm" }
  | { kind: "partner" }
  | { kind: "noop" }
  | { kind: "unsupported_combination"; message: string }
  | { kind: "unsupported_status"; message: string };

function isSettlementStatus(
  status: ReservationEditStatus,
): status is "accepted" | "rejected" {
  return status === "accepted" || status === "rejected";
}

export function planReservationEditSubmit(input: {
  statusChanged: boolean;
  partnerChanged: boolean;
  nextStatus: ReservationEditStatus;
}): ReservationEditSubmitPlan {
  if (!input.statusChanged && !input.partnerChanged) {
    return { kind: "noop" };
  }

  if (input.statusChanged && input.partnerChanged) {
    return {
      kind: "unsupported_combination",
      message: COMBINED_SETTLEMENT_AND_PARTNER_MESSAGE,
    };
  }

  if (input.statusChanged) {
    if (input.nextStatus === "rejected") return { kind: "reject" };
    if (input.nextStatus === "accepted") return { kind: "confirm" };
    return {
      kind: "unsupported_status",
      message: UNSUPPORTED_STATUS_MESSAGE,
    };
  }

  return { kind: "partner" };
}
