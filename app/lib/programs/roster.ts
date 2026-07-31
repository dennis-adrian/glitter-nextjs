import type {
  SessionPurchaseStatus,
  SessionTicketStatus,
} from "@/app/lib/programs/definitions";

/**
 * What a person on an occurrence's roster is actually doing with their seat.
 *
 * Deliberately *not* the purchase status. A purchase left in `pending_upload`
 * past its deadline still reads `pending_upload` in the database until the
 * sweep runs, but its seat is already available to the next buyer — showing an
 * admin a list of people who are not coming, and a "held" count that does not
 * match the remaining count beside it, is worse than showing nothing.
 *
 * The states below partition the roster so that everything except `released`
 * occupies exactly one seat, which is what makes the counts reconcile with
 * `resolveAvailability`. `roster.test.ts` pins that agreement.
 */
export type RosterSeatState =
  | "confirmed"
  | "awaiting_review"
  | "changes_requested"
  | "holding"
  | "released";

export const ROSTER_SEAT_STATE_LABELS: Record<RosterSeatState, string> = {
  confirmed: "Confirmado",
  awaiting_review: "Por revisar",
  changes_requested: "Cambios pedidos",
  holding: "Reservando",
  released: "Liberado",
};

/**
 * Display order: what the admin must act on first, then what is settled, then
 * what no longer matters. Confirmed sits at the top because on the day of the
 * session it is the only part of the list anyone reads.
 */
const STATE_ORDER: Record<RosterSeatState, number> = {
  confirmed: 0,
  awaiting_review: 1,
  changes_requested: 2,
  holding: 3,
  released: 4,
};

export function rosterStateOrder(state: RosterSeatState): number {
  return STATE_ORDER[state];
}

export type RosterSeatInput = {
  purchaseStatus: SessionPurchaseStatus;
  /** Null when no ticket has been issued for this line yet. */
  ticketStatus: SessionTicketStatus | null;
  /** Null for free purchases, which never hold. */
  holdExpiresAt: Date | null;
};

/**
 * Mirrors the occupancy predicate in `fetchOccurrenceAvailability`: a valid
 * ticket, or a purchase under review, or a `pending_upload` whose hold has not
 * lapsed. Anything else has given the seat back.
 *
 * A cancelled ticket is `released` even though its purchase still says
 * `approved` — support cancels the ticket to free the seat, and the roster has
 * to agree with the seat count rather than with the purchase row.
 */
export function resolveRosterSeatState(
  input: RosterSeatInput,
  now: Date,
): RosterSeatState {
  if (input.ticketStatus === "valid") return "confirmed";

  if (input.purchaseStatus === "under_verification") return "awaiting_review";
  if (input.purchaseStatus === "changes_requested") return "changes_requested";

  if (
    input.purchaseStatus === "pending_upload" &&
    input.holdExpiresAt !== null &&
    input.holdExpiresAt.getTime() > now.getTime()
  ) {
    return "holding";
  }

  return "released";
}

/** Everything but `released` is sitting in one of the occurrence's seats. */
export function occupiesSeat(state: RosterSeatState): boolean {
  return state !== "released";
}

export type RosterTotals = {
  confirmed: number;
  awaitingReview: number;
  changesRequested: number;
  holding: number;
  released: number;
  /** Seats actually taken — the sum of everything except `released`. */
  occupied: number;
  /** Rows the admin has to do something about, for the "needs attention" cue. */
  needsAction: number;
};

export function summarizeRoster(states: RosterSeatState[]): RosterTotals {
  const totals: RosterTotals = {
    confirmed: 0,
    awaitingReview: 0,
    changesRequested: 0,
    holding: 0,
    released: 0,
    occupied: 0,
    needsAction: 0,
  };

  for (const state of states) {
    if (state === "confirmed") totals.confirmed += 1;
    if (state === "awaiting_review") totals.awaitingReview += 1;
    if (state === "changes_requested") totals.changesRequested += 1;
    if (state === "holding") totals.holding += 1;
    if (state === "released") totals.released += 1;
    if (occupiesSeat(state)) totals.occupied += 1;
  }

  // `changes_requested` counts too: the buyer cannot move without the team
  // looking at the replacement they were asked for.
  totals.needsAction = totals.awaitingReview + totals.changesRequested;

  return totals;
}
