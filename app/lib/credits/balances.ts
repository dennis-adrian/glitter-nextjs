export type CreditBalanceInput = {
  ledgerBalance: number;
  activeHolds: number;
  underReviewIssuance: number;
};

export type CreditBalances = CreditBalanceInput & {
  spendableBalance: number;
  invoiceEligibleBalance: number;
};

/** Keep all arithmetic at the database's two-decimal money precision. */
export function roundCredits(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function calculateCreditBalances(input: CreditBalanceInput): CreditBalances {
  const ledgerBalance = roundCredits(input.ledgerBalance);
  const activeHolds = roundCredits(input.activeHolds);
  const underReviewIssuance = roundCredits(input.underReviewIssuance);
  const spendableBalance = roundCredits(ledgerBalance - activeHolds);

  return {
    ledgerBalance,
    activeHolds,
    underReviewIssuance,
    spendableBalance,
    invoiceEligibleBalance: Math.max(
      0,
      roundCredits(spendableBalance - underReviewIssuance),
    ),
  };
}

export function exactCreditShortfall(
  requiredCredits: number,
  spendableBalance: number,
): number {
  return Math.max(0, roundCredits(requiredCredits - spendableBalance));
}

/** Positive invoices may use only confirmed, unheld credit. */
export function canFundInvoiceCreditAllocation(
  balances: CreditBalances,
  amount: number,
) {
  return (
    balances.ledgerBalance >= 0 && balances.invoiceEligibleBalance >= amount
  );
}

export type InvoiceCreditPlan = {
  /** Confirmed, unheld credit that may be posted against the invoice now. */
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
  const applicableAmount =
    debtAmount > 0
      ? 0
      : Math.max(
          0,
          roundCredits(
            Math.min(outstanding, balances.invoiceEligibleBalance),
          ),
        );
  return {
    applicableAmount,
    shortfallAmount: Math.max(
      0,
      roundCredits(outstanding + debtAmount - balances.invoiceEligibleBalance),
    ),
    debtAmount,
  };
}
