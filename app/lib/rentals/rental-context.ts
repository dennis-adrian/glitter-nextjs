import type { RentalEligibilityContext } from "@/app/lib/rentals/types";

export type ResolvedRentalContext = {
  festivalId: number;
  reservationId: number;
};

export function resolveRentalLineContext(
  contexts: RentalEligibilityContext[],
  rentalFestivalId?: number | null,
  rentalReservationId?: number | null,
):
  | { ok: true; context: ResolvedRentalContext }
  | { ok: false; message: string; cause: string } {
  if (rentalFestivalId != null && rentalReservationId != null) {
    const match = contexts.find(
      (context) =>
        context.festivalId === rentalFestivalId &&
        context.reservationId === rentalReservationId,
    );
    if (!match) {
      return {
        ok: false,
        message: "El contexto de alquiler seleccionado ya no es válido.",
        cause: "invalid_rental_context",
      };
    }
    return {
      ok: true,
      context: {
        festivalId: match.festivalId,
        reservationId: match.reservationId,
      },
    };
  }

  if (rentalFestivalId == null && rentalReservationId == null) {
    if (contexts.length === 1) {
      const [context] = contexts;
      return {
        ok: true,
        context: {
          festivalId: context.festivalId,
          reservationId: context.reservationId,
        },
      };
    }
    return {
      ok: false,
      message: "Selecciona un festival/reserva para alquilar.",
      cause: "rental_context_required",
    };
  }

  return {
    ok: false,
    message: "Selecciona un festival/reserva para alquilar.",
    cause: "rental_context_required",
  };
}
