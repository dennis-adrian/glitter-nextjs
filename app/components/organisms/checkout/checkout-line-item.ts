import type { Key } from "react";

import type { CartBundleLine } from "@/app/lib/merch/bundle-definitions";
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

/** A bundle offer in the checkout summary, charged as one fixed price. */
export type CheckoutBundleItem = {
  key: Key;
  name: string;
  imageUrl: string | null;
  quantity: number;
  unitPriceCents: number;
  separateUnitPriceCents: number;
  components: {
    productName: string;
    variantLabel: string | null;
    quantity: number;
    /** Set for components still in pre-sale. */
    presaleAvailableDate?: Date | null;
    isPresale?: boolean;
  }[];
  /** Why the bundle cannot be bought as is, if anything. */
  issue?: string | null;
};

export function toCheckoutBundleItem(line: CartBundleLine): CheckoutBundleItem {
  return {
    key: line.key,
    name: line.name,
    imageUrl: line.imageUrl,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    separateUnitPriceCents: line.separateUnitPriceCents,
    components: line.components.map((component) => ({
      productName: component.productName,
      variantLabel: component.variantLabel,
      quantity: component.quantity,
      isPresale: component.productStatus === "presale",
      presaleAvailableDate: component.productAvailableDate,
    })),
    issue: line.issue ? line.message : null,
  };
}
