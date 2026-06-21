"use server";

import { and, eq } from "drizzle-orm";

import type { RentalEligibilityResult } from "@/app/lib/rentals/types";
import { getCurrentBaseProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  festivals,
  reservationParticipants,
  standReservations,
  stands,
  users,
} from "@/db/schema";

async function fetchEligibleContextsForUser(userId: number) {
  const rows = await db
    .select({
      festivalId: festivals.id,
      festivalName: festivals.name,
      reservationId: standReservations.id,
      standId: stands.id,
      standLabel: stands.label,
      standNumber: stands.standNumber,
    })
    .from(reservationParticipants)
    .innerJoin(
      standReservations,
      eq(reservationParticipants.reservationId, standReservations.id),
    )
    .innerJoin(stands, eq(standReservations.standId, stands.id))
    .innerJoin(festivals, eq(standReservations.festivalId, festivals.id))
    .where(
      and(
        eq(reservationParticipants.userId, userId),
        eq(standReservations.status, "accepted"),
        eq(stands.status, "confirmed"),
        eq(festivals.status, "active"),
      ),
    );

  return rows;
}

export async function getRentalEligibilityForCurrentUser(): Promise<RentalEligibilityResult> {
  const user = await getCurrentBaseProfile();
  if (!user) {
    return {
      eligible: false,
      error: "guest_not_allowed",
      message: "Debes iniciar sesión para alquilar productos.",
    };
  }

  return assertRentalEligibility(user.id);
}

export async function assertRentalEligibility(
  userId: number,
  rentalFestivalId?: number,
  rentalReservationId?: number,
): Promise<RentalEligibilityResult> {
  const [profile] = await db
    .select({ status: users.status })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!profile || profile.status !== "verified") {
    return {
      eligible: false,
      error: "not_verified",
      message: "Solo usuarios verificados pueden alquilar productos.",
    };
  }

  const contexts = await fetchEligibleContextsForUser(userId);
  if (contexts.length === 0) {
    const hasActiveFestival = await db.query.festivals.findFirst({
      where: eq(festivals.status, "active"),
      columns: { id: true },
    });

    return {
      eligible: false,
      error: hasActiveFestival
        ? "not_active_participant"
        : "no_active_festival",
      message: hasActiveFestival
        ? "Necesitas una reserva aceptada en un festival activo para alquilar."
        : "No hay un festival activo en este momento.",
    };
  }

  const hasRentalFestivalId = rentalFestivalId != null;
  const hasRentalReservationId = rentalReservationId != null;
  if (hasRentalFestivalId !== hasRentalReservationId) {
    return {
      eligible: false,
      error: "invalid_rental_context",
      message: "El contexto de alquiler seleccionado ya no es válido.",
    };
  }

  if (hasRentalFestivalId && hasRentalReservationId) {
    const match = contexts.find(
      (context) =>
        context.festivalId === rentalFestivalId &&
        context.reservationId === rentalReservationId,
    );
    if (!match) {
      return {
        eligible: false,
        error: "invalid_rental_context",
        message: "El contexto de alquiler seleccionado ya no es válido.",
      };
    }
  }

  return {
    eligible: true,
    userId,
    contexts,
  };
}

export async function canUserRent(userId: number | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const result = await assertRentalEligibility(userId);
  return result.eligible;
}
