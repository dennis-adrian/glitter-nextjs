import { DateTime } from "luxon";

import {
  classifyPortion,
  type CreditBucket,
  type SpendAttribution,
  type SpendPortion,
} from "@/app/lib/festivals/finance/credit-attribution";
import type { InvoiceTender } from "@/app/lib/payments/tender";
import { roundMoney } from "@/app/lib/reservations/money";

export const DEFAULT_CREDIT_LEAD_DAYS = 5;
export const MIN_CREDIT_LEAD_DAYS = 0;
export const MAX_CREDIT_LEAD_DAYS = 30;

/** Bolivia keeps one offset all year, so a calendar day here is unambiguous. */
const FINANCE_TIMEZONE = "America/La_Paz";

/** Reservations that hold, or are on their way to hold, a space. */
const LIVE_RESERVATION_STATUSES = new Set([
  "pending",
  "verification_payment",
  "accepted",
]);

/**
 * The first moment a credit purchase counts as this edition's: the start of
 * the day `leadDays` before reservations open, in Bolivian time.
 */
export function creditWindowStart(
  reservationsStartDate: Date,
  leadDays: number,
): Date {
  return DateTime.fromJSDate(reservationsStartDate, { zone: FINANCE_TIMEZONE })
    .startOf("day")
    .minus({ days: leadDays })
    .toJSDate();
}

export type FinanceInvoice = {
  id: number;
  reservationId: number;
  reservationStatus: string;
  status: "pending" | "verification_payment" | "paid" | "cancelled";
  originalAmount: number;
  discountAmount: number;
  amount: number;
  dueAt: Date | null;
  discountCode: { code: string; unit: "percentage" | "amount"; value: number } | null;
  tender: InvoiceTender;
  /** The spend behind each credit allocation that was not reversed. */
  creditSpendIds: number[];
};

export type FinanceFeatureSpend = {
  ledgerEntryId: number;
  type: "full_table_access" | "late_partner" | "reservation_release";
  /** Positive: credits charged. */
  amount: number;
};

export type FinanceFreeReservation = { reservationId: number; value: number };

export type FinanceInput = {
  festivalId: number;
  invoices: readonly FinanceInvoice[];
  featureSpends: readonly FinanceFeatureSpend[];
  freeReservations: readonly FinanceFreeReservation[];
  attribution: SpendAttribution;
  windowStart: Date;
  now: Date;
};

export type CreditBuckets = Record<CreditBucket, number>;

export type DiscountRow = {
  /** Null groups discounts given without a code. */
  code: string | null;
  label: string;
  uses: number;
  amount: number;
};

export type PendingRow = {
  key: "overdue" | "upcoming" | "inReview";
  reservations: number;
  amount: number;
};

/**
 * A purchased portion that the lead-days setting can move between buckets,
 * so the settings dialog can preview a change before it is saved.
 */
export type MovablePortion = { amount: number; purchasedAt: string };

export type FestivalFinanceSummary = {
  reservations: number;
  gross: number;
  discounts: number;
  writeOffs: number;
  writeOffReservations: number;
  net: number;
  invoiceCollected: number;
  /** Covered on reservations that no longer hold a space. Kept money. */
  inactiveCollected: number;
  outstanding: number;
  directPayment: number;
  invoiceCredits: number;
  featureCredits: number;
  credits: CreditBuckets;
  creditsTotal: number;
  collected: number;
  newMoney: number;
  inReviewPurchases: number;
  extras: { type: FinanceFeatureSpend["type"]; count: number; amount: number }[];
  discountRows: DiscountRow[];
  pending: PendingRow[];
  free: { count: number; value: number };
  movable: MovablePortion[];
  /** Festival credits no lead-days change can move (bought for it, or after). */
  fixedFestivalCredits: number;
};

const EXTRA_ORDER: FinanceFeatureSpend["type"][] = [
  "full_table_access",
  "late_partner",
  "reservation_release",
];

function discountLabel(code: FinanceInvoice["discountCode"]) {
  if (!code) return "ajuste manual";
  return code.unit === "percentage" ? `${code.value}%` : `Bs${code.value}`;
}

/**
 * The cash and credits a cobro kept once its repricing refund went back.
 *
 * A refund already returned to the participant is not collected. Like
 * "Devolver créditos", it comes out of the credits first and then the cash,
 * so the two always add up to `coveredAmount`.
 */
export function keptTender(tender: InvoiceTender): {
  cash: number;
  credits: number;
} {
  const refund = Math.max(0, tender.refundedAmount);
  const refundedCredits = Math.min(tender.confirmedCreditAmount, refund);
  const refundedCash = Math.min(
    tender.approvedCashAmount,
    roundMoney(refund - refundedCredits),
  );
  return {
    cash: roundMoney(tender.approvedCashAmount - refundedCash),
    credits: roundMoney(tender.confirmedCreditAmount - refundedCredits),
  };
}

/**
 * A cobro's credit portions with `refunded` taken back, newest first.
 *
 * The totals take a repricing refund out of the cobro's credits before its
 * cash; the breakdown has to drop the same amount or its buckets add up to
 * more than the credits it explains. Which credits went back is not recorded,
 * so the last ones spent go first: the spends are ordered by ledger id and the
 * portions inside each spend are already oldest first.
 */
function netRefundedCredits(
  portions: readonly SpendPortion[],
  refunded: number,
): SpendPortion[] {
  const out = portions.map((portion) => ({ ...portion }));
  let remaining = refunded;
  for (let i = out.length - 1; i >= 0 && remaining > 0; i--) {
    const cut = Math.min(remaining, out[i].amount);
    out[i].amount = roundMoney(out[i].amount - cut);
    remaining = roundMoney(remaining - cut);
  }
  return out;
}

/** Everything the finance page shows, from one festival's billing rows. */
export function summarizeFestivalFinance(
  input: FinanceInput,
): FestivalFinanceSummary {
  const credits: CreditBuckets = {
    festival: 0,
    earlier: 0,
    gifted: 0,
    inReview: 0,
    unpaid: 0,
  };
  const inReviewTopUps = new Set<number | null>();
  const movable: MovablePortion[] = [];
  let fixedFestivalCredits = 0;

  const addPortions = (portions: readonly SpendPortion[]) => {
    for (const portion of portions) {
      if (portion.amount <= 0) continue;
      const bucket = classifyPortion(portion, input.festivalId, input.windowStart);
      credits[bucket] += portion.amount;
      const source = portion.source;
      if (bucket === "inReview" && source?.kind === "purchase") {
        inReviewTopUps.add(source.topUpId);
      }
      // Only these two can trade places when the lead days change.
      if (bucket !== "festival" && bucket !== "earlier") continue;
      if (
        source?.kind === "purchase" &&
        source.intendedFestivalId !== input.festivalId &&
        !portion.coveredLater
      ) {
        movable.push({
          amount: portion.amount,
          purchasedAt: source.purchasedAt.toISOString(),
        });
      } else {
        fixedFestivalCredits += portion.amount;
      }
    }
  };
  const addSpend = (spendId: number) =>
    addPortions(input.attribution.get(spendId) ?? []);

  let reservations = 0;
  let gross = 0;
  let discounts = 0;
  let writeOffs = 0;
  let writeOffReservations = 0;
  let net = 0;
  let invoiceCollected = 0;
  let inactiveCollected = 0;
  let outstanding = 0;
  let directPayment = 0;
  let invoiceCredits = 0;
  const liveReservationIds = new Set<number>();
  const codes = new Map<string, DiscountRow>();
  const pending: Record<PendingRow["key"], PendingRow> = {
    overdue: { key: "overdue", reservations: 0, amount: 0 },
    upcoming: { key: "upcoming", reservations: 0, amount: 0 },
    inReview: { key: "inReview", reservations: 0, amount: 0 },
  };

  for (const invoice of input.invoices) {
    const live =
      invoice.status !== "cancelled" &&
      LIVE_RESERVATION_STATUSES.has(invoice.reservationStatus);
    const { tender } = invoice;

    // Money that came in counts wherever it sits; a cancelled reservation
    // whose payment was kept still paid it.
    const kept = keptTender(tender);
    const refundedCredits = roundMoney(
      tender.confirmedCreditAmount - kept.credits,
    );
    directPayment += kept.cash;
    invoiceCredits += kept.credits;
    addPortions(
      netRefundedCredits(
        [...invoice.creditSpendIds]
          .sort((a, b) => a - b)
          .flatMap((spendId) => input.attribution.get(spendId) ?? []),
        refundedCredits,
      ),
    );

    if (!live) {
      inactiveCollected += tender.coveredAmount;
      continue;
    }

    liveReservationIds.add(invoice.reservationId);
    gross += invoice.originalAmount;
    discounts += invoice.discountAmount;
    net += invoice.amount;
    invoiceCollected += tender.coveredAmount;
    outstanding += tender.outstandingAmount;

    const writeOff = roundMoney(
      invoice.originalAmount - invoice.discountAmount - invoice.amount,
    );
    if (writeOff > 0) {
      writeOffs += writeOff;
      writeOffReservations += 1;
    }

    if (invoice.discountAmount > 0) {
      const key = invoice.discountCode?.code ?? "";
      const row = codes.get(key) ?? {
        code: invoice.discountCode?.code ?? null,
        label: discountLabel(invoice.discountCode),
        uses: 0,
        amount: 0,
      };
      row.uses += 1;
      row.amount += invoice.discountAmount;
      codes.set(key, row);
    }

    if (tender.outstandingAmount > 0) {
      const key: PendingRow["key"] =
        tender.submittedCashAmount > 0 || invoice.status === "verification_payment"
          ? "inReview"
          : invoice.dueAt && invoice.dueAt.getTime() < input.now.getTime()
            ? "overdue"
            : "upcoming";
      pending[key].reservations += 1;
      pending[key].amount += tender.outstandingAmount;
    }
  }
  reservations = liveReservationIds.size;

  const extras = new Map<FinanceFeatureSpend["type"], { count: number; amount: number }>();
  let featureCredits = 0;
  for (const spend of input.featureSpends) {
    featureCredits += spend.amount;
    addSpend(spend.ledgerEntryId);
    const row = extras.get(spend.type) ?? { count: 0, amount: 0 };
    row.count += 1;
    row.amount += spend.amount;
    extras.set(spend.type, row);
  }

  for (const key of Object.keys(credits) as CreditBucket[]) {
    credits[key] = roundMoney(credits[key]);
  }
  const creditsTotal = roundMoney(invoiceCredits + featureCredits);
  const collected = roundMoney(directPayment + creditsTotal);

  return {
    reservations,
    gross: roundMoney(gross),
    discounts: roundMoney(discounts),
    writeOffs: roundMoney(writeOffs),
    writeOffReservations,
    net: roundMoney(net),
    invoiceCollected: roundMoney(invoiceCollected),
    inactiveCollected: roundMoney(inactiveCollected),
    outstanding: roundMoney(outstanding),
    directPayment: roundMoney(directPayment),
    invoiceCredits: roundMoney(invoiceCredits),
    featureCredits: roundMoney(featureCredits),
    credits,
    creditsTotal,
    collected,
    newMoney: roundMoney(directPayment + credits.festival),
    inReviewPurchases: inReviewTopUps.size,
    extras: EXTRA_ORDER.filter((type) => extras.has(type)).map((type) => ({
      type,
      count: extras.get(type)!.count,
      amount: roundMoney(extras.get(type)!.amount),
    })),
    discountRows: [...codes.values()]
      .map((row) => ({ ...row, amount: roundMoney(row.amount) }))
      .sort((a, b) => (a.code == null ? 1 : b.code == null ? -1 : b.amount - a.amount)),
    pending: (["overdue", "upcoming", "inReview"] as const)
      .map((key) => ({ ...pending[key], amount: roundMoney(pending[key].amount) }))
      .filter((row) => row.reservations > 0),
    free: {
      count: input.freeReservations.length,
      value: roundMoney(
        input.freeReservations.reduce((sum, row) => sum + row.value, 0),
      ),
    },
    movable,
    fixedFestivalCredits: roundMoney(fixedFestivalCredits),
  };
}

/**
 * How `festival` and `earlier` would split with a different lead, for the
 * settings dialog's preview. Everything else stays where it is.
 */
export function resplitMovableCredits(
  movable: readonly MovablePortion[],
  reservationsStartDate: Date,
  leadDays: number,
  fixedFestival: number,
): { festival: number; earlier: number; windowStart: Date } {
  const windowStart = creditWindowStart(reservationsStartDate, leadDays);
  let festival = fixedFestival;
  let earlier = 0;
  for (const portion of movable) {
    if (new Date(portion.purchasedAt).getTime() >= windowStart.getTime()) {
      festival += portion.amount;
    } else {
      earlier += portion.amount;
    }
  }
  return { festival: roundMoney(festival), earlier: roundMoney(earlier), windowStart };
}
