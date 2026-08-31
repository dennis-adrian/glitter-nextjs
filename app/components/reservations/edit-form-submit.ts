export type ReservationEditStatus =
  | "pending"
  | "verification_payment"
  | "accepted"
  | "rejected";

export const COMBINED_SETTLEMENT_AND_PARTNER_MESSAGE =
  "No se puede aceptar o rechazar la reserva al mismo tiempo que se cambia el compañero. Guardá cada cambio por separado.";

export type ReservationEditSubmitPlan =
  | { kind: "reject" }
  | { kind: "confirm" }
  | { kind: "generic" }
  | { kind: "unsupported_combination"; message: string };

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
  if (
    input.statusChanged &&
    input.partnerChanged &&
    isSettlementStatus(input.nextStatus)
  ) {
    return {
      kind: "unsupported_combination",
      message: COMBINED_SETTLEMENT_AND_PARTNER_MESSAGE,
    };
  }

  if (input.statusChanged && !input.partnerChanged) {
    if (input.nextStatus === "rejected") return { kind: "reject" };
    if (input.nextStatus === "accepted") return { kind: "confirm" };
  }

  return { kind: "generic" };
}
