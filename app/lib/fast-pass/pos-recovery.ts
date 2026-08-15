export type RecoverablePosSale = {
  id: number;
  idempotencyKey: string;
  totalAmount: number;
  paidCount: number;
  childCount: number;
};

export function resolveRecoveredPosSale(
  savedKey: string | null,
  recentSales: RecoverablePosSale[],
) {
  if (!savedKey) return null;
  const sale = recentSales.find(
    (candidate) => candidate.idempotencyKey === savedKey,
  );
  if (!sale) return null;
  return {
    purchaseId: sale.id,
    total: sale.totalAmount,
    paidCount: sale.paidCount,
    wristbandCount: sale.paidCount + sale.childCount,
  };
}
