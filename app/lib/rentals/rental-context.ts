import type { RentalEligibilityContext } from "@/app/lib/rentals/types";

export type RentalEligibilityContextRow = {
  festivalId: number;
  festivalName: string;
  festivalStartDate: Date | null;
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
  return context.stands
    .map((stand) => `Stand ${stand.standLabel ?? ""}${stand.standNumber}`)
    .join(", ");
}

export function formatRentalContextSummary(
  context: RentalEligibilityContext,
): string {
  return `Alquiler para ${context.festivalName}, ${formatRentalContextStands(context)}`;
}

function getFestivalTimeDistance(
  context: RentalEligibilityContext,
  now: number,
): number {
  if (!context.festivalStartDate) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.abs(new Date(context.festivalStartDate).getTime() - now);
}

export function getDefaultRentalReservationId(
  contexts: RentalEligibilityContext[],
): number | null {
  if (contexts.length === 0) {
    return null;
  }

  if (contexts.length === 1) {
    return contexts[0].reservationId;
  }

  const now = Date.now();
  const [closestContext] = [...contexts].sort(
    (left, right) =>
      getFestivalTimeDistance(left, now) - getFestivalTimeDistance(right, now),
  );

  return closestContext.reservationId;
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
