import { cartItems, carts } from "@/db/schema";
import { InferSelectModel } from "drizzle-orm";
import {
  BaseProductWithImages,
  ProductVariantWithSelections,
} from "@/app/lib/products/definitions";
import type {
  BundleSelectionInput,
  CartBundleLine,
} from "@/app/lib/merch/bundle-definitions";

export type BaseCart = InferSelectModel<typeof carts>;
export type BaseCartItem = InferSelectModel<typeof cartItems>;

export type CartItemWithProduct = BaseCartItem & {
  product: BaseProductWithImages;
  variant: ProductVariantWithSelections | null;
};

export type CartWithItems = BaseCart & {
  items: CartItemWithProduct[];
  /** Bundle offers, resolved against the current catalog and stock. */
  bundles: CartBundleLine[];
};

export type GuestCartItem = {
  lineKey: string;
  productId: number;
  productVariantId: number | null;
  productVariantLabel: string | null;
  quantity: number;
  product: BaseProductWithImages;
  variant: ProductVariantWithSelections | null;
};

/**
 * A bundle in a guest cart. Only `bundleId`, `bundleVersion`, `quantity` and
 * `selections` are sent to the server; the rest is a display snapshot that is
 * refreshed from the server whenever the cart is opened.
 */
export type GuestCartBundle = {
  lineKey: string;
  bundleId: number;
  bundleVersion: number;
  quantity: number;
  selections: BundleSelectionInput[];
  name: string;
  slug: string;
  imageUrl: string | null;
  unitPriceCents: number;
  separateUnitPriceCents: number;
  components: {
    productName: string;
    variantLabel: string | null;
    quantity: number;
    imageUrl: string | null;
  }[];
};
