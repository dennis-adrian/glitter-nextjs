import { cartItems, carts } from "@/db/schema";
import { InferSelectModel } from "drizzle-orm";
import {
  BaseProductWithImages,
  ProductVariantWithSelections,
} from "@/app/lib/products/definitions";

export type BaseCart = InferSelectModel<typeof carts>;
export type BaseCartItem = InferSelectModel<typeof cartItems>;

export type CartItemWithProduct = BaseCartItem & {
  product: BaseProductWithImages;
  variant: ProductVariantWithSelections | null;
};

export type CartWithItems = BaseCart & {
  items: CartItemWithProduct[];
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
