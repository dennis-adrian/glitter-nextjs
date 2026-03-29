import type { Key } from "react";

import type { BaseProductWithImages } from "@/app/lib/products/definitions";

/** Normalized line for checkout summary + presale notice (shared across guest + server cart). */
export type CheckoutLineItem = {
	key: Key;
	product: BaseProductWithImages;
	quantity: number;
};
