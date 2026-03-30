import { cartItems, carts } from "@/db/schema";
import { InferSelectModel } from "drizzle-orm";
import { BaseProductWithImages } from "@/app/lib/products/definitions";

export type BaseCart = InferSelectModel<typeof carts>;
export type BaseCartItem = InferSelectModel<typeof cartItems>;

export type CartItemWithProduct = BaseCartItem & {
	product: BaseProductWithImages;
};

export type CartWithItems = BaseCart & {
	items: CartItemWithProduct[];
};

export type GuestCartItem = {
	productId: number;
	quantity: number;
	product: BaseProductWithImages;
};
