import "server-only";

import { and, count, eq, inArray } from "drizzle-orm";

import { fetchCreditAttentionCounts } from "@/app/lib/credits/admin-queries";
import { fetchPendingVoucherCount } from "@/app/lib/orders/actions";
import { reservationCoverageState } from "@/app/lib/payments/coverage";
import { fetchReservationsByFestivalId } from "@/app/lib/reservations/actions";
import {
  COBROS_COVERAGE,
  consoleHref,
} from "@/app/lib/reservations/console-lenses";
import { fetchUsersAggregates } from "@/app/lib/users/actions";
import { db } from "@/db";
import { infractions, sessionPurchases } from "@/db/schema";

export type ReviewQueueKey =
  | "reservations"
  | "profiles"
  | "credits"
  | "orders"
  | "programs"
  | "infractions";

export type ReviewQueueCount = {
  key: ReviewQueueKey;
  count: number;
  href: string;
};

/** Settlement queue: the festival's reservations whose payment needs a decision. */
async function countReservationPayments(festivalId: number) {
  const reservations = await fetchReservationsByFestivalId(festivalId);
  const states = new Set<string>(COBROS_COVERAGE);
  return reservations.filter((reservation) => {
    const state = reservationCoverageState(reservation);
    return state != null && states.has(state);
  }).length;
}

/** Program purchases paid by bank QR whose voucher waits for a decision. */
async function countProgramPayments() {
  const [row] = await db
    .select({ total: count() })
    .from(sessionPurchases)
    .where(
      and(
        eq(sessionPurchases.paymentMode, "bank_qr"),
        inArray(sessionPurchases.status, ["under_verification", "changes_requested"]),
      ),
    );
  return Number(row?.total ?? 0);
}

/** Infractions nobody has started on: the page's "Pendientes" filter. */
async function countPendingInfractions() {
  const [row] = await db
    .select({ total: count() })
    .from(infractions)
    .where(eq(infractions.status, "pending"));
  return Number(row?.total ?? 0);
}

/**
 * What waits for the team, queue by queue, with the page that works each one.
 * Every count is what that page lists by default, so a number never promises
 * more or less than the page shows. Festival admins see only the queues their
 * pages are theirs: the festival's payments, program payments and
 * infractions.
 */
export async function loadReviewQueues({
  role,
  activeFestivalId,
}: {
  role: "admin" | "festival_admin";
  activeFestivalId: number | null;
}): Promise<ReviewQueueCount[]> {
  const isAdmin = role === "admin";

  const [reservations, programs, pendingInfractions, profiles, credits, orders] =
    await Promise.all([
      activeFestivalId
        ? countReservationPayments(activeFestivalId)
        : Promise.resolve(null),
      countProgramPayments(),
      countPendingInfractions(),
      isAdmin
        ? fetchUsersAggregates({
            includeAdmins: false,
            status: ["pending", "rejected"],
            profileCompletion: "complete",
          }).then((result) => result.total)
        : Promise.resolve(null),
      isAdmin
        ? fetchCreditAttentionCounts().then((result) => result.pendingReviews)
        : Promise.resolve(null),
      isAdmin ? fetchPendingVoucherCount() : Promise.resolve(null),
    ]);

  const queues: (ReviewQueueCount | null)[] = [
    activeFestivalId && reservations != null
      ? {
          key: "reservations",
          count: reservations,
          href: consoleHref({ festivalId: activeFestivalId, lens: "cobros" }),
        }
      : null,
    profiles != null
      ? {
          key: "profiles",
          count: profiles,
          href: "/dashboard/profile_requests?limit=10&offset=0&includeAdmins=false&sort=updatedAt&direction=desc&profileCompletion=complete",
        }
      : null,
    credits != null
      ? { key: "credits", count: credits, href: "/dashboard/credits/reviews" }
      : null,
    orders != null
      ? { key: "orders", count: orders, href: "/dashboard/store/payments" }
      : null,
    { key: "programs", count: programs, href: "/dashboard/programs/purchases" },
    {
      key: "infractions",
      count: pendingInfractions,
      href: "/dashboard/infractions?status=pending&limit=25&offset=0",
    },
  ];
  return queues.filter((queue): queue is ReviewQueueCount => queue != null);
}
