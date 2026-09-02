"use server";

import {
  InvoiceWithParticipants,
  InvoiceWithPaymentsAndStand,
  InvoiceWithPaymentsAndStandAndProfile,
  ReservationWithStandAndInvoicesAndFestival,
} from "@/app/data/invoices/definitions";
import { db } from "@/db";
import {
  invoiceCreditAllocations,
  invoiceSettlementSubmissions,
  invoices,
  payments,
  reservationParticipants,
  standReservations,
} from "@/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
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
    input && typeof input === "object" && "invoiceId" in input ? input : input;
  return submitZeroValueInvoiceForReview(nested);
}

export type InvoiceTenderSummary = {
  approvedCashAmount: number;
  confirmedCreditAmount: number;
  outstandingAmount: number;
};

/**
 * Returns canonical tender totals for the invoice owner. The mutable settlement
 * service rechecks the same values under locks before it writes anything.
 */
export async function fetchInvoiceTenderSummary(
  invoiceId: number,
): Promise<InvoiceTenderSummary | null> {
  const actor = await getCurrentUserProfile();
  if (!actor) return null;

  const [invoice] = await db
    .select({
      id: invoices.id,
      userId: invoices.userId,
      amount: invoices.amount,
    })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!invoice || invoice.userId !== actor.id) return null;

  const [cash] = await db
    .select({ amount: sql<number>`coalesce(sum(${payments.amount}), 0)` })
    .from(payments)
    .where(
      and(
        eq(payments.invoiceId, invoice.id),
        sql`EXISTS (
          SELECT 1
          FROM ${invoiceSettlementSubmissions}
          WHERE ${invoiceSettlementSubmissions.invoiceId} = ${invoice.id}
            AND ${invoiceSettlementSubmissions.paymentId} = ${payments.id}
            AND ${invoiceSettlementSubmissions.status} = 'approved'
        )`,
      ),
    );
  const [credits] = await db
    .select({
      amount: sql<number>`coalesce(sum(${invoiceCreditAllocations.amount}), 0)`,
    })
    .from(invoiceCreditAllocations)
    .where(eq(invoiceCreditAllocations.invoiceId, invoice.id));

  const approvedCashAmount = Number(cash?.amount ?? 0);
  const confirmedCreditAmount = Number(credits?.amount ?? 0);
  return {
    approvedCashAmount,
    confirmedCreditAmount,
    outstandingAmount: Math.max(
      0,
      Math.round(
        (Number(invoice.amount) - approvedCashAmount - confirmedCreditAmount) *
          100,
      ) / 100,
    ),
  };
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
  const capacityReservations = reservations.filter(
    (r) =>
      r.status === "pending" ||
      r.status === "verification_payment" ||
      r.status === "accepted",
  );
  const outstandingInvoiceCount = capacityReservations.reduce(
    (count, reservation) =>
      count + countOutstandingInvoices(reservation.invoices),
    0,
  );
  return {
    reservationCount: capacityReservations.length,
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
