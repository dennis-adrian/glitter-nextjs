import { roundMoney } from "@/app/lib/reservations/money";

/**
 * Which credits paid for each spend, oldest first.
 *
 * A participant's credits sit in one balance: a spend does not record which
 * purchase or gift funded it. To tell the finance page how much of a festival
 * was paid with gifted credits, with credits bought for it, or with balance
 * carried in from before, the ledger is replayed per person as a queue of
 * lots, consumed in the order they arrived (FIFO).
 *
 * Entries that undo each other are left out as a pair before the replay: a
 * rejected top-up and its reversal, a refunded spend and its refund, a revoked
 * gift and its revocation. Neither side moved money in the end, and dropping
 * both keeps the oldest-first order intact for everything else.
 *
 * A balance can go negative (a top-up rejected after its credits were spent).
 * The spend that ran past zero waits as a deficit, and the next credits that
 * arrive cover it first, before they become a lot of their own.
 */

export type LedgerEntryType =
  | "top_up"
  | "spend"
  | "reversal"
  | "admin_grant"
  | "admin_adjustment";

export type AttributionLedgerEntry = {
  id: number;
  userId: number;
  type: LedgerEntryType;
  /** Signed: credits in are positive, credits out negative. */
  amount: number;
  createdAt: Date;
  topUpId: number | null;
  reversesEntryId: number | null;
  metadata: Record<string, string> | null;
};

export type AttributionTopUp = {
  id: number;
  status: "awaiting_voucher" | "under_review" | "approved" | "rejected" | "expired";
  /** When the voucher was uploaded, which is when the person paid. */
  submittedAt: Date | null;
  /** The festival this purchase was opened for, when it was opened for one. */
  intendedFestivalId: number | null;
};

export type CreditSource =
  | {
      kind: "purchase";
      /** Null for an admin's "mark as paid" debt resolution. */
      topUpId: number | null;
      purchasedAt: Date;
      intendedFestivalId: number | null;
      /** The voucher behind it has not been approved yet. */
      underReview: boolean;
    }
  | { kind: "gift" };

export type SpendPortion = {
  amount: number;
  /** Null while nothing has covered this part of the spend yet. */
  source: CreditSource | null;
  /** The credits arrived after the spend, to cover a negative balance. */
  coveredLater: boolean;
};

export type SpendAttribution = Map<number, SpendPortion[]>;

type Lot = { remaining: number; source: CreditSource };
type Deficit = { spendId: number | null; remaining: number };

const EPSILON = 0.000001;

function byTime(a: AttributionLedgerEntry, b: AttributionLedgerEntry) {
  return a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id;
}

/** Ids of entries that cancel out: every reversal and the entry it reverses. */
function cancelledPairs(entries: readonly AttributionLedgerEntry[]) {
  const ids = new Set(entries.map((entry) => entry.id));
  const cancelled = new Set<number>();
  for (const entry of entries) {
    if (entry.reversesEntryId != null && ids.has(entry.reversesEntryId)) {
      cancelled.add(entry.id);
      cancelled.add(entry.reversesEntryId);
    }
  }
  return cancelled;
}

function sourceForCredit(
  entry: AttributionLedgerEntry,
  topUps: ReadonlyMap<number, AttributionTopUp>,
): CreditSource {
  if (entry.type === "top_up") {
    const topUp = entry.topUpId != null ? topUps.get(entry.topUpId) : undefined;
    return {
      kind: "purchase",
      topUpId: entry.topUpId,
      purchasedAt: topUp?.submittedAt ?? entry.createdAt,
      intendedFestivalId: topUp?.intendedFestivalId ?? null,
      underReview: topUp?.status === "under_review",
    };
  }
  // A debt an admin marked as paid was settled with money outside the app.
  // Anything else an admin adds (a gift, a waived debt) brought no money in.
  if (entry.type === "admin_adjustment" && entry.metadata?.resolution === "mark_paid") {
    return {
      kind: "purchase",
      topUpId: null,
      purchasedAt: entry.createdAt,
      intendedFestivalId: null,
      underReview: false,
    };
  }
  return { kind: "gift" };
}

function push(
  out: SpendAttribution,
  spendId: number | null,
  portion: SpendPortion,
) {
  if (spendId == null || portion.amount <= EPSILON) return;
  const list = out.get(spendId);
  if (list) list.push(portion);
  else out.set(spendId, [portion]);
}

function replayUser(
  entries: readonly AttributionLedgerEntry[],
  topUps: ReadonlyMap<number, AttributionTopUp>,
  out: SpendAttribution,
) {
  const cancelled = cancelledPairs(entries);
  const lots: Lot[] = [];
  const deficits: Deficit[] = [];

  for (const entry of [...entries].sort(byTime)) {
    if (cancelled.has(entry.id) || entry.amount === 0) continue;

    if (entry.amount > 0) {
      const source = sourceForCredit(entry, topUps);
      let remaining = entry.amount;
      while (remaining > EPSILON && deficits.length > 0) {
        const deficit = deficits[0];
        const take = Math.min(remaining, deficit.remaining);
        push(out, deficit.spendId, { amount: take, source, coveredLater: true });
        deficit.remaining -= take;
        remaining -= take;
        if (deficit.remaining <= EPSILON) deficits.shift();
      }
      if (remaining > EPSILON) lots.push({ remaining, source });
      continue;
    }

    // Credits out. Only a spend is revenue; an admin deduction or an unpaired
    // reversal still uses up the oldest credits, so it is replayed too.
    const spendId = entry.type === "spend" ? entry.id : null;
    let remaining = -entry.amount;
    while (remaining > EPSILON && lots.length > 0) {
      const lot = lots[0];
      const take = Math.min(remaining, lot.remaining);
      push(out, spendId, { amount: take, source: lot.source, coveredLater: false });
      lot.remaining -= take;
      remaining -= take;
      if (lot.remaining <= EPSILON) lots.shift();
    }
    if (remaining > EPSILON) deficits.push({ spendId, remaining });
  }

  for (const deficit of deficits) {
    push(out, deficit.spendId, {
      amount: deficit.remaining,
      source: null,
      coveredLater: false,
    });
  }
}

/** Attributes every spend in `entries` (any number of people) to its credits. */
export function attributeCreditSpends(
  entries: readonly AttributionLedgerEntry[],
  topUps: readonly AttributionTopUp[],
): SpendAttribution {
  const topUpsById = new Map(topUps.map((topUp) => [topUp.id, topUp]));
  const byUser = new Map<number, AttributionLedgerEntry[]>();
  for (const entry of entries) {
    const list = byUser.get(entry.userId);
    if (list) list.push(entry);
    else byUser.set(entry.userId, [entry]);
  }

  const out: SpendAttribution = new Map();
  for (const userEntries of byUser.values()) {
    replayUser(userEntries, topUpsById, out);
  }
  for (const [spendId, portions] of out) {
    out.set(
      spendId,
      portions.map((portion) => ({ ...portion, amount: roundMoney(portion.amount) })),
    );
  }
  return out;
}

export type CreditBucket = "festival" | "earlier" | "gifted" | "inReview" | "unpaid";

/**
 * Which bucket a portion of a spend at `festivalId` falls in.
 *
 * A purchase counts as this edition's when it was opened for this festival,
 * when it came after the spend (to cover a negative balance), or when it was
 * paid on or after `windowStart`. Anything older is balance carried in.
 */
export function classifyPortion(
  portion: SpendPortion,
  festivalId: number,
  windowStart: Date,
): CreditBucket {
  const source = portion.source;
  if (source == null) return "unpaid";
  if (source.kind === "gift") return "gifted";
  if (source.underReview) return "inReview";
  if (
    source.intendedFestivalId === festivalId ||
    portion.coveredLater ||
    source.purchasedAt.getTime() >= windowStart.getTime()
  ) {
    return "festival";
  }
  return "earlier";
}
