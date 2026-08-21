export function resolveUnitCost(
  productUnitCost: number | null,
  variantUnitCost?: number | null,
): number | null {
  return variantUnitCost ?? productUnitCost ?? null;
}
