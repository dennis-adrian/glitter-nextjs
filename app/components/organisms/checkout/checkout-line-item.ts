import type { Key } from "react";

import type {
  BaseProductWithImages,
  ProductVariantWithSelections,
} from "@/app/lib/products/definitions";

/** Normalized line for checkout summary + presale notice (shared across guest + server cart). */
export type CheckoutLineItem = {
  key: Key;
  product: BaseProductWithImages;
  variant: ProductVariantWithSelections | null;
  productVariantLabel: string | null;
  quantity: number;
  transactionType?: "purchase" | "rental";
};
