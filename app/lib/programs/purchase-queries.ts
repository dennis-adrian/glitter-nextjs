import "server-only";

import { and, asc, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { cache } from "react";

import type { SessionPurchaseStatus } from "@/app/lib/programs/definitions";
import {
  buildSearchPattern,
  ticketMatchesQuery,
} from "@/app/lib/programs/search";
import { db } from "@/db";
import {
  programSettings,
  sessionPurchaseEvents,
  sessionPurchaseLines,
  sessionPurchaseVouchers,
  sessionPurchases,
  sessionTickets,
  users,
} from "@/db/schema";

/** Everything the secure access page and the profile area need to render. */
const purchaseWith = {
  program: true as const,
  promoRedemption: true as const,
  lines: {
    with: {
      session: true as const,
      occurrence: { with: { venue: true as const } },
      ticket: true as const,
    },
  },
  // Newest first: the page only ever shows the current version, and the
  // ordering is what makes `vouchers[0]` mean that.
  vouchers: {
    orderBy: [desc(sessionPurchaseVouchers.version)],
  },
};

/**
 * Loads a purchase for the access check.
 *
 * Deliberately unfiltered by viewer: authorization is `resolvePurchaseAccess`'s
 * job, and doing it here would make it easy to render a page that forgot to
 * ask. The caller must not use the result before that check passes.
 */
export const fetchPurchaseForAccess = cache(async (purchaseId: number) => {
  return db.query.sessionPurchases.findFirst({
    where: eq(sessionPurchases.id, purchaseId),
    with: purchaseWith,
  });
});

export type PurchaseForAccess = NonNullable<
  Awaited<ReturnType<typeof fetchPurchaseForAccess>>
>;

/**
 * The admin review queue: paid purchases with a proof waiting on a decision.
 *
 * Ordered oldest first — a buyer who has been waiting longest is reviewed
 * first, and the seat they hold is the one blocking someone else.
 */
export const fetchPurchasesAwaitingReview = cache(async () => {
  return db.query.sessionPurchases.findMany({
    where: and(
      eq(sessionPurchases.paymentMode, "bank_qr"),
      inArray(sessionPurchases.status, [
        "under_verification",
        "changes_requested",
      ]),
    ),
    with: { ...purchaseWith, buyer: true },
    orderBy: [asc(sessionPurchases.voucherSubmittedAt)],
  });
});

/**
 * One enrollment for the admin detail page.
 *
 * Deliberately unfiltered by status and payment mode, unlike
 * `fetchPurchasesAwaitingReview`. That queue answers "what needs a decision
 * today"; this answers "show me this enrollment", which support needs for an
 * approved seat, a free registration, or a purchase already closed — none of
 * which the queue will ever list.
 *
 * Loads the event log and the attendance behind each ticket so the page can be
 * the single place an admin reconciles what happened without a database query.
 */
export const fetchPurchaseForAdmin = cache(async (purchaseId: number) => {
  return db.query.sessionPurchases.findFirst({
    where: eq(sessionPurchases.id, purchaseId),
    with: {
      ...purchaseWith,
      buyer: true,
      lines: {
        with: {
          session: true as const,
          occurrence: { with: { venue: true as const } },
          ticket: { with: { attendance: true as const } },
        },
      },
      // Newest first: an admin opening this page is asking what happened last.
      events: {
        orderBy: [desc(sessionPurchaseEvents.createdAt)],
        with: { actor: true as const },
      },
    },
  });
});

export type PurchaseForAdmin = NonNullable<
  Awaited<ReturnType<typeof fetchPurchaseForAdmin>>
>;

export type PurchaseAwaitingReview = Awaited<
  ReturnType<typeof fetchPurchasesAwaitingReview>
>[number];

/** Bank QR and policy settings the payment step needs. */
export const fetchProgramSettings = cache(async () => {
  return db.query.programSettings.findFirst({
    where: eq(programSettings.key, "global"),
  });
});

/** A signed-in buyer's own purchases, for their profile area. */
export const fetchPurchasesForUser = cache(async (userId: number) => {
  return db.query.sessionPurchases.findMany({
    where: eq(sessionPurchases.userId, userId),
    with: purchaseWith,
    orderBy: [desc(sessionPurchases.createdAt)],
  });
});

/** Shortest query worth running; one character would scan the whole table. */
export const ENROLLMENT_SEARCH_MIN_LENGTH = 2;
const ENROLLMENT_SEARCH_LIMIT = 25;

export type EnrollmentSearchResult = {
  purchaseId: number;
  attendeeName: string;
  attendeeEmail: string;
  isGuest: boolean;
  status: SessionPurchaseStatus;
  paymentMode: "bank_qr" | "free";
  totalAmount: number;
  createdAt: Date;
  sessions: { title: string; startsAt: Date }[];
};

/**
 * "#42" and "42" both mean purchase 42 to the person reading it out.
 *
 * The whole query (after an optional leading `#`) must be digits — a partial
 * number mixed into a name is not an id lookup.
 */
export function parseEnrollmentPurchaseId(query: string): number | null {
  const digits = query.trim().replace(/^#/, "");
  if (!/^\d+$/.test(digits)) return null;
  const id = Number(digits);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Finds an enrollment by whoever it belongs to, from anywhere in the dashboard.
 *
 * Support takes a call from someone who knows their own name and nothing about
 * which program, session, or occurrence they booked — the hierarchy the rest of
 * the dashboard is organised by. Without this the only route to an approved
 * enrollment was program → session → occurrence → roster.
 *
 * Matches the ticket's snapshot name as well as the buyer's account and guest
 * details, because those are three different people's worth of text and the
 * caller may quote any of them. A ticket code and a `#42` purchase id are
 * accepted too: both get read aloud off an email or a screenshot.
 */
export async function searchEnrollments(
  rawQuery: string,
): Promise<EnrollmentSearchResult[]> {
  const query = rawQuery.trim();
  // Parse before the min-length guard: a one-digit id like "7" is a complete
  // lookup, not a short text search that would scan the table.
  const purchaseId = parseEnrollmentPurchaseId(query);

  if (purchaseId === null && query.length < ENROLLMENT_SEARCH_MIN_LENGTH) {
    return [];
  }

  let matchIds: number[];

  if (purchaseId !== null) {
    // Resolve alone: OR-ing into the limited text search can bury the exact
    // hit behind newer name matches that fill the LIMIT.
    matchIds = [purchaseId];
  } else {
    // Escaped: an unescaped `_` or `%` typed by an admin silently widens the
    // match instead of narrowing it (see `escapeLikePattern`).
    const pattern = buildSearchPattern(query);

    /**
     * Ids first, then a second load. Matching across lines and tickets multiplies
     * rows per purchase, and resolving that in SQL would either need a `GROUP BY`
     * over every selected column or risk a `LIMIT` that silently drops results.
     */
    const matches = await db
      .selectDistinct({
        id: sessionPurchases.id,
        createdAt: sessionPurchases.createdAt,
      })
      .from(sessionPurchases)
      .leftJoin(users, eq(users.id, sessionPurchases.userId))
      .leftJoin(
        sessionPurchaseLines,
        eq(sessionPurchaseLines.purchaseId, sessionPurchases.id),
      )
      .leftJoin(
        sessionTickets,
        eq(sessionTickets.purchaseLineId, sessionPurchaseLines.id),
      )
      .where(
        or(
          ilike(sessionPurchases.guestName, pattern),
          ilike(sessionPurchases.guestEmail, pattern),
          ilike(users.displayName, pattern),
          ilike(users.firstName, pattern),
          ilike(users.lastName, pattern),
          ilike(users.email, pattern),
          ilike(sessionTickets.attendeeName, pattern),
          ilike(sessionTickets.attendeeEmail, pattern),
          ilike(sessionTickets.code, pattern),
        ),
      )
      .orderBy(desc(sessionPurchases.createdAt))
      .limit(ENROLLMENT_SEARCH_LIMIT);

    matchIds = matches.map((match) => match.id);
  }

  if (matchIds.length === 0) return [];

  const purchases = await db.query.sessionPurchases.findMany({
    where: inArray(sessionPurchases.id, matchIds),
    with: {
      buyer: true,
      lines: { with: { ticket: true } },
    },
    orderBy: [desc(sessionPurchases.createdAt)],
  });

  return purchases.map((purchase) => {
    /**
     * The ticket is the authoritative name once issued — it is what was
     * printed and emailed — matching how the roster resolves identity.
     *
     * Prefer whichever ticket the query actually matched: a purchase can carry
     * several lines, so answering a search for one attendee or one ticket code
     * with the first ticket on the purchase would name the wrong person. Falls
     * back to the first when the hit came from the buyer or guest fields.
     */
    const tickets = purchase.lines.flatMap((line) =>
      line.ticket ? [line.ticket] : [],
    );
    const ticket =
      tickets.find((candidate) => ticketMatchesQuery(candidate, query)) ??
      tickets[0] ??
      null;

    return {
      purchaseId: purchase.id,
      attendeeName:
        ticket?.attendeeName ??
        purchase.guestName ??
        purchase.buyer?.displayName ??
        purchase.buyer?.email ??
        "Comprador",
      attendeeEmail:
        ticket?.attendeeEmail ??
        purchase.guestEmail ??
        purchase.buyer?.email ??
        "—",
      isGuest: purchase.userId === null,
      status: purchase.status,
      paymentMode: purchase.paymentMode,
      totalAmount: purchase.totalAmount,
      createdAt: purchase.createdAt,
      sessions: purchase.lines.map((line) => ({
        title: line.sessionTitleSnapshot,
        startsAt: line.occurrenceStartsAtSnapshot,
      })),
    };
  });
}
