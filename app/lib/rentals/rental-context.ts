import type { RentalEligibilityContext } from "@/app/lib/rentals/types";

export type RentalEligibilityContextRow = {
  festivalId: number;
  festivalName: string;
  reservationId: number;
  standId: number;
  standLabel: string | null;
  standNumber: number;
};

export type ResolvedRentalContext = {
  festivalId: number;
  reservationId: number;
};

export function normalizeRentalEligibilityContexts(
  rows: RentalEligibilityContextRow[],
): RentalEligibilityContext[] {
  const byFestival = new Map<number, RentalEligibilityContext>();

  for (const row of rows) {
    const existing = byFestival.get(row.festivalId);
    const stand = {
      reservationId: row.reservationId,
      standId: row.standId,
      standLabel: row.standLabel,
      standNumber: row.standNumber,
    };

    if (!existing) {
      byFestival.set(row.festivalId, {
        ...row,
        reservationIds: [row.reservationId],
        stands: [stand],
      });
      continue;
    }

    existing.reservationIds.push(row.reservationId);
    existing.stands.push(stand);
  }

  return Array.from(byFestival.values());
}

export function rentalContextIncludesReservation(
  context: RentalEligibilityContext,
  reservationId: number | null | undefined,
): boolean {
  if (reservationId == null) return false;
  return (
    context.reservationId === reservationId ||
    context.reservationIds.includes(reservationId)
  );
}

export function formatRentalContextStands(
  context: RentalEligibilityContext,
): string {
  const stands =
    context.stands.length > 0
      ? context.stands
      : [
          {
            reservationId: context.reservationId,
            standId: context.standId,
            standLabel: context.standLabel,
            standNumber: context.standNumber,
          },
        ];

  return stands
    .map((stand) => `Stand ${stand.standLabel ?? ""}${stand.standNumber}`)
    .join(", ");
}

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
        rentalContextIncludesReservation(context, rentalReservationId),
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
        reservationId: rentalReservationId,
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
      message: "Selecciona un festival para alquilar.",
      cause: "rental_context_required",
    };
  }

  return {
    ok: false,
    message: "Selecciona un festival para alquilar.",
    cause: "rental_context_required",
  };
}
