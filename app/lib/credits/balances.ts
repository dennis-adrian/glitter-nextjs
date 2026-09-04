export type CreditBalanceInput = {
  ledgerBalance: number;
  activeHolds: number;
  underReviewIssuance: number;
};

export type CreditBalances = CreditBalanceInput & {
  /**
   * Everything the participant can spend right now, on anything.
   *
   * Credits are usable the moment their voucher is submitted. There is no
   * confirmed-only tier: a voucher that turns out to be bad is reversed, which
   * leaves the account in debt for an admin to resolve, and that is the same
   * machinery whether the credits went to a feature or to an invoice.
   */
  spendableBalance: number;
};

/** Keep all arithmetic at the database's two-decimal money precision. */
export function roundCredits(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function calculateCreditBalances(
  input: CreditBalanceInput,
): CreditBalances {
  const ledgerBalance = roundCredits(input.ledgerBalance);
  const activeHolds = roundCredits(input.activeHolds);
  const underReviewIssuance = roundCredits(input.underReviewIssuance);
  const spendableBalance = roundCredits(ledgerBalance - activeHolds);

  return {
    ledgerBalance,
    activeHolds,
    // Reported, never withheld: how much of the balance is still awaiting
    // review is worth telling someone, but it does not restrict them.
    underReviewIssuance,
    spendableBalance,
  };
}

export function exactCreditShortfall(
  requiredCredits: number,
  spendableBalance: number,
): number {
  return Math.max(0, roundCredits(requiredCredits - spendableBalance));
}

/**
 * Whether an invoice allocation of this size can be funded.
 *
 * The only bar is a non-negative ledger: debt blocks every credit operation
 * until it is cleared. Credits still under review are spendable here, exactly
 * as they already were for optional features.
 */
export function canFundInvoiceCreditAllocation(
  balances: CreditBalances,
  amount: number,
) {
  return balances.ledgerBalance >= 0 && balances.spendableBalance >= amount;
}

export type InvoiceCreditPlan = {
  /** Unheld credit that may be posted against the invoice now. */
  applicableAmount: number;
  /** Exact credits to buy so the invoice can be settled entirely with credit. */
  shortfallAmount: number;
  /** Amount owed from a reversed top-up; blocks every credit operation. */
  debtAmount: number;
};

/**
 * Shared derivation for the invoice credit panel and the server command that
 * opens a top-up. Debt is added to the shortfall rather than netted against
 * it, because a top-up settles a negative ledger before anything is spendable.
 */
export function invoiceCreditPlan(
  balances: CreditBalances,
  outstandingAmount: number,
): InvoiceCreditPlan {
  const outstanding = Math.max(0, roundCredits(outstandingAmount));
  const debtAmount = Math.max(0, roundCredits(-balances.ledgerBalance));
  // Floored: a negative balance is debt, counted once in `debtAmount`. Letting
  // it through as a negative "usable" amount would add the debt to the
  // shortfall a second time.
  const usableBalance = Math.max(0, balances.spendableBalance);
  const applicableAmount =
    debtAmount > 0
      ? 0
      : Math.max(0, roundCredits(Math.min(outstanding, usableBalance)));
  return {
    applicableAmount,
    shortfallAmount: Math.max(
      0,
      roundCredits(outstanding + debtAmount - usableBalance),
    ),
    debtAmount,
  };
}

/**
 * The part of what is reserved that no credit backs any more.
 *
 * A reservation outlives the credits that paid for it when the voucher behind
 * them is rejected: the ledger drops back while the hold stays. Nothing is
 * owed yet — a hold posts no entry, only its capture does — but releasing
 * this hold hands back nothing, and using it is what would create the debt.
 * Anywhere a release is offered has to say which of the two it is.
 */
export function unbackedHoldAmount(balances: CreditBalances): number {
  return Math.max(
    0,
    roundCredits(balances.activeHolds - Math.max(0, balances.ledgerBalance)),
  );
}
