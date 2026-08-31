"use server";

import {
  InvoiceWithParticipants,
  InvoiceWithPaymentsAndStand,
  InvoiceWithPaymentsAndStandAndProfile,
  ReservationWithStandAndInvoicesAndFestival,
} from "@/app/data/invoices/definitions";
import { db } from "@/db";
import {
  invoices,
  reservationParticipants,
  standReservations,
} from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { type ReservationActionResult } from "@/app/lib/reservations/errors";
import {
  canViewAdminReservationData,
  canViewInvoiceRecord,
} from "@/app/lib/reservations/policy";
import { submitZeroValueInvoiceForReview } from "@/app/lib/reservations/payment-service";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { countOutstandingInvoices } from "@/app/lib/payments/helpers";

export async function confirmFreeInvoice(
  input: unknown,
): Promise<ReservationActionResult<{ submissionId: number }>> {
  const nested =
    input && typeof input === "object" && "invoiceId" in input
      ? input
      : input;
  return submitZeroValueInvoiceForReview(nested);
}

export async function fetchLatestInvoiceByProfileId(
  profileId: number,
): Promise<InvoiceWithPaymentsAndStand | undefined | null> {
  const actor = await getCurrentUserProfile();
  if (!actor) return null;
  if (
    actor.id !== profileId &&
    !canViewAdminReservationData({ id: actor.id, role: actor.role })
  ) {
    return null;
  }
  try {
    return await db.query.invoices.findFirst({
      with: {
        payments: true,
        reservation: {
          with: {
            stand: true,
            festival: {
              with: {
                festivalDates: true,
              },
            },
            participants: {
              with: { user: true },
            },
          },
        },
        user: true,
      },
      orderBy: desc(invoices.createdAt),
      where: eq(invoices.userId, profileId),
    });
  } catch (error) {
    console.error("Error fetching latest invoice", error);
    return null;
  }
}

export async function fetchInvoicesByReservation(
  reservationId: number,
): Promise<InvoiceWithPaymentsAndStand[]> {
  const actor = await getCurrentUserProfile();
  if (!actor) return [];

  try {
    const reservation = await db.query.standReservations.findFirst({
      where: eq(standReservations.id, reservationId),
      with: { participants: true },
    });
    if (!reservation) return [];

    const participantUserIds = reservation.participants.map((p) => p.userId);
    const invoicesForReservation = await db.query.invoices.findMany({
      with: {
        payments: true,
        reservation: {
          with: {
            stand: {
              with: {
                qrCode: true,
              },
            },
            festival: {
              with: {
                festivalDates: true,
              },
            },
          },
        },
      },
      where: eq(invoices.reservationId, reservationId),
    });

    return invoicesForReservation.filter((invoice) =>
      canViewInvoiceRecord({
        actor: { id: actor.id, role: actor.role },
        invoiceOwnerUserId: invoice.userId,
        participantUserIds,
      }),
    );
  } catch (error) {
    console.error("Error fetching invoices by reservation", error);
    return [];
  }
}

export async function fetchInvoice(
  id: number,
): Promise<InvoiceWithPaymentsAndStandAndProfile | undefined | null> {
  const actor = await getCurrentUserProfile();
  if (!actor) return null;

  try {
    const invoice = await db.query.invoices.findFirst({
      where: eq(invoices.id, id),
      with: {
        payments: true,
        reservation: {
          with: {
            stand: true,
            festival: {
              with: {
                festivalDates: true,
              },
            },
            participants: {
              with: { user: true },
            },
          },
        },
        user: true,
      },
    });
    if (!invoice) return null;
    if (
      !canViewInvoiceRecord({
        actor: { id: actor.id, role: actor.role },
        invoiceOwnerUserId: invoice.userId,
        participantUserIds: invoice.reservation.participants.map(
          (participant) => participant.userId,
        ),
      })
    ) {
      return null;
    }
    return invoice;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function fetchReservationsWithInvoicesByProfileAndFestival(
  profileId: number,
  festivalId: number,
): Promise<ReservationWithStandAndInvoicesAndFestival[]> {
  const actor = await getCurrentUserProfile();
  if (!actor) return [];
  if (
    actor.id !== profileId &&
    !canViewAdminReservationData({ id: actor.id, role: actor.role })
  ) {
    return [];
  }
  try {
    const reservationIdsSubquery = db
      .select({ id: reservationParticipants.reservationId })
      .from(reservationParticipants)
      .where(eq(reservationParticipants.userId, profileId));

    return await db.query.standReservations.findMany({
      where: and(
        eq(standReservations.festivalId, festivalId),
        inArray(standReservations.id, reservationIdsSubquery),
      ),
      with: {
        stand: {
          with: {
            festivalSector: true,
          },
        },
        festival: {
          with: {
            festivalDates: true,
          },
        },
        invoices: {
          with: {
            payments: true,
            user: true,
          },
        },
      },
      orderBy: desc(standReservations.createdAt),
    });
  } catch (error) {
    console.error(
      "Error fetching reservations with invoices by profile and festival",
      error,
    );
    return [];
  }
}

export async function fetchOutstandingInvoiceCountByProfileAndFestival(
  profileId: number,
  festivalId: number,
): Promise<{ reservationCount: number; outstandingInvoiceCount: number }> {
  const reservations = await fetchReservationsWithInvoicesByProfileAndFestival(
    profileId,
    festivalId,
  );
  const nonRejectedReservations = reservations.filter(
    (r) => r.status !== "rejected",
  );
  const outstandingInvoiceCount = nonRejectedReservations.reduce(
    (count, reservation) =>
      count + countOutstandingInvoices(reservation.invoices),
    0,
  );
  return {
    reservationCount: nonRejectedReservations.length,
    outstandingInvoiceCount,
  };
}

export async function fetchPendingInvoicesByProfile(
  profileId: number,
): Promise<InvoiceWithPaymentsAndStand[]> {
  const actor = await getCurrentUserProfile();
  if (!actor) return [];
  if (
    actor.id !== profileId &&
    !canViewAdminReservationData({ id: actor.id, role: actor.role })
  ) {
    return [];
  }
  try {
    return await db.query.invoices.findMany({
      where: and(
        eq(invoices.userId, profileId),
        eq(invoices.status, "pending"),
      ),
      with: {
        payments: true,
        reservation: {
          with: {
            stand: {
              with: {
                qrCode: true,
              },
            },
            festival: {
              with: {
                festivalDates: true,
              },
            },
          },
        },
      },
      orderBy: desc(invoices.createdAt),
    });
  } catch (error) {
    console.error("Error fetching pending invoices by profile", error);
    return [];
  }
}

export async function fetchInvoicesByFestival(
  festivalId: number,
): Promise<InvoiceWithParticipants[]> {
  const actor = await getCurrentUserProfile();
  if (
    !actor ||
    !canViewAdminReservationData({ id: actor.id, role: actor.role })
  ) {
    return [];
  }
  try {
    const reservationsSubquery = db
      .select({ id: standReservations.id })
      .from(standReservations)
      .where(eq(standReservations.festivalId, festivalId));

    return await db.query.invoices.findMany({
      where: inArray(invoices.reservationId, reservationsSubquery),
      with: {
        payments: true,
        reservation: {
          with: {
            stand: true,
            festival: {
              with: {
                festivalDates: true,
              },
            },
            participants: {
              with: { user: true },
            },
          },
        },
        user: true,
      },
    });
  } catch (error) {
    console.error("Error fetching invoices by festival", error);
    return [];
  }
}
