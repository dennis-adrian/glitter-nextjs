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
