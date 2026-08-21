export type ProjectionBaseLine = {
  id: number;
  productId: number;
  productVariantId: number | null;
  productVariantLabel: string | null;
  productNameAtPurchase: string | null;
  productName: string;
  quantity: number;
  priceAtPurchase: number;
  unitCostAtPurchase: number | null;
  transactionType: "purchase" | "rental";
};

export type ProjectionAdjustmentLine = {
  id: number;
  baseOrderItemId: number | null;
  productId: number;
  productVariantId: number | null;
  productNameSnapshot: string;
  variantLabelSnapshot: string | null;
  quantityDelta: number;
  unitPriceSnapshot: number;
  unitCostSnapshot: number | null;
  transactionType: "purchase" | "rental";
};

export type EffectiveOrderLine = {
  key: string;
  baseOrderItemId: number | null;
  productId: number;
  productVariantId: number | null;
  productName: string;
  variantLabel: string | null;
  quantity: number;
  unitPrice: number;
  unitCost: number | null;
  transactionType: "purchase" | "rental";
};

/** Projects immutable source lines plus adjustment deltas into current lines. */
export function getEffectiveOrderLines(
  baseLines: readonly ProjectionBaseLine[],
  adjustmentLines: readonly ProjectionAdjustmentLine[],
): EffectiveOrderLine[] {
  const deltasByBaseId = new Map<number, number>();
  const additions: EffectiveOrderLine[] = [];

  for (const line of adjustmentLines) {
    if (line.baseOrderItemId == null) {
      additions.push({
        key: `adjustment:${line.id}`,
        baseOrderItemId: null,
        productId: line.productId,
        productVariantId: line.productVariantId,
        productName: line.productNameSnapshot,
        variantLabel: line.variantLabelSnapshot,
        quantity: line.quantityDelta,
        unitPrice: line.unitPriceSnapshot,
        unitCost: line.unitCostSnapshot,
        transactionType: line.transactionType,
      });
      continue;
    }
    deltasByBaseId.set(
      line.baseOrderItemId,
      (deltasByBaseId.get(line.baseOrderItemId) ?? 0) + line.quantityDelta,
    );
  }

  return [
    ...baseLines.map((line) => ({
      key: `base:${line.id}`,
      baseOrderItemId: line.id,
      productId: line.productId,
      productVariantId: line.productVariantId,
      productName: line.productNameAtPurchase ?? line.productName,
      variantLabel: line.productVariantLabel,
      quantity: line.quantity + (deltasByBaseId.get(line.id) ?? 0),
      unitPrice: line.priceAtPurchase,
      unitCost: line.unitCostAtPurchase,
      transactionType: line.transactionType,
    })),
    ...additions,
  ].filter((line) => line.quantity > 0);
}

export function getEffectiveOrderTotal(lines: readonly EffectiveOrderLine[]) {
  return lines.reduce(
    (total, line) => total + line.quantity * line.unitPrice,
    0,
  );
}

export function getOrderCostCoverage(lines: readonly EffectiveOrderLine[]) {
  const purchaseLines = lines.filter(
    (line) => line.transactionType === "purchase",
  );
  const revenue = purchaseLines.reduce(
    (total, line) => total + line.quantity * line.unitPrice,
    0,
  );
  const coveredRevenue = purchaseLines
    .filter((line) => line.unitCost != null)
    .reduce((total, line) => total + line.quantity * line.unitPrice, 0);
  return {
    revenue,
    coveredRevenue,
    percent: revenue === 0 ? null : (coveredRevenue / revenue) * 100,
  };
}
