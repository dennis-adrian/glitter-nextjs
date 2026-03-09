"use server";

import { db } from "@/db";
import { cartItems, carts } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	createOrderInTx,
	sendOrderEmails,
} from "@/app/lib/orders/actions";
import { BaseCart, CartWithItems } from "@/app/lib/cart/definitions";

type CartTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CartCheckoutSnapshot = {
	cartId: number;
	items: { productId: number; quantity: number }[];
};

async function getOrCreateCart(userId: number): Promise<BaseCart> {
	const [cart] = await db
		.insert(carts)
		.values({ userId })
		.onConflictDoUpdate({
			target: carts.userId,
			set: { updatedAt: new Date() },
		})
		.returning();
	return cart;
}

export async function fetchCartWithItems(
	userId: number,
): Promise<CartWithItems | null> {
	try {
		const cart = await db.query.carts.findFirst({
			where: eq(carts.userId, userId),
			with: {
				items: {
					orderBy: (cartItems, { asc }) => [asc(cartItems.id)],
					with: {
						product: {
							with: { images: true },
						},
					},
				},
			},
		});
		return cart ?? null;
	} catch (error) {
		console.error(error);
		return null;
	}
}

export async function fetchCartItemCount(userId: number): Promise<number> {
	try {
		const cart = await db.query.carts.findFirst({
			where: eq(carts.userId, userId),
			with: { items: true },
		});
		return cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
	} catch (error) {
		console.error(error);
		return 0;
	}
}

export async function addToCart(
	userId: number,
	productId: number,
	quantity: number,
): Promise<{ success: boolean; newCount: number }> {
	try {
		if (quantity <= 0) {
			return { success: false, newCount: 0 };
		}

		const cart = await getOrCreateCart(userId);
		const cappedQuantity = Math.min(quantity, 5);

		await db
			.insert(cartItems)
			.values({
				cartId: cart.id,
				productId,
				quantity: cappedQuantity,
			})
			.onConflictDoUpdate({
				target: [cartItems.cartId, cartItems.productId],
				set: {
					quantity: sql`least(${cartItems.quantity} + excluded.quantity, 5)`,
					updatedAt: new Date(),
				},
			});

		revalidatePath("/store");
		const newCount = await fetchCartItemCount(userId);
		return { success: true, newCount };
	} catch (error) {
		console.error(error);
		return { success: false, newCount: 0 };
	}
}

export async function updateCartItemQuantity(
	userId: number,
	productId: number,
	quantity: number,
): Promise<void> {
	try {
		const cart = await db.query.carts.findFirst({
			where: eq(carts.userId, userId),
		});
		if (!cart) return;

		const capped = Math.min(quantity, 5);

		if (capped <= 0) {
			await db
				.delete(cartItems)
				.where(
					and(
						eq(cartItems.cartId, cart.id),
						eq(cartItems.productId, productId),
					),
				);
		} else {
			await db
				.update(cartItems)
				.set({ quantity: capped, updatedAt: new Date() })
				.where(
					and(
						eq(cartItems.cartId, cart.id),
						eq(cartItems.productId, productId),
					),
				);
		}

		revalidatePath("/store");
	} catch (error) {
		console.error(error);
	}
}

export async function removeFromCart(
	userId: number,
	productId: number,
): Promise<void> {
	try {
		const cart = await db.query.carts.findFirst({
			where: eq(carts.userId, userId),
		});
		if (!cart) return;

		await db
			.delete(cartItems)
			.where(
				and(eq(cartItems.cartId, cart.id), eq(cartItems.productId, productId)),
			);

		revalidatePath("/store");
	} catch (error) {
		console.error(error);
	}
}

export async function clearCart(userId: number): Promise<void> {
	try {
		const cart = await db.query.carts.findFirst({
			where: eq(carts.userId, userId),
		});
		if (!cart) return;

		await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
		revalidatePath("/store");
	} catch (error) {
		console.error(error);
	}
}

/** Locks the user's cart and cart_items in the current transaction. Returns null if no cart. */
export async function fetchCartWithItemsForCheckout(
	tx: CartTx,
	userId: number,
): Promise<CartCheckoutSnapshot | null> {
	const [cart] = await tx
		.select()
		.from(carts)
		.where(eq(carts.userId, userId))
		.for("update");
	if (!cart) return null;

	const rows = await tx
		.select({ productId: cartItems.productId, quantity: cartItems.quantity })
		.from(cartItems)
		.where(eq(cartItems.cartId, cart.id))
		.for("update");

	return {
		cartId: cart.id,
		items: rows.map((r) => ({ productId: r.productId, quantity: r.quantity })),
	};
}

/** Deletes all items for the given cart inside the current transaction. */
export async function clearCartInTx(
	tx: CartTx,
	cartId: number,
): Promise<void> {
	await tx.delete(cartItems).where(eq(cartItems.cartId, cartId));
}

export async function checkoutCart(
	userId: number,
	customerEmail: string,
	customerName: string,
): Promise<{
	success: boolean;
	message: string;
	orderId?: number | null;
}> {
	try {
		const orderResult = await db.transaction(async (tx) => {
			const snapshot = await fetchCartWithItemsForCheckout(tx, userId);
			if (!snapshot || snapshot.items.length === 0) {
				throw new Error("empty_cart");
			}

			const orderItemsMap = new Map<number, number>(
				snapshot.items.map((item) => [item.productId, item.quantity]),
			);

			const result = await createOrderInTx(
				tx,
				orderItemsMap,
				userId,
				customerEmail,
				customerName,
			);

			await clearCartInTx(tx, snapshot.cartId);
			return result;
		});

		try {
			await sendOrderEmails({
				orderId: orderResult.orderId,
				customerEmail,
				customerName,
				products: orderResult.mappedProducts,
				total: orderResult.totalAmount,
			});
		} catch (emailError) {
			console.error("Failed to send order emails", emailError);
		}

		revalidatePath("/store");
		return {
			success: true,
			message: "Orden creada correctamente.",
			orderId: orderResult.orderId,
		};
	} catch (err) {
		console.error("checkoutCart error:", err);
		if (err instanceof Error) {
			if (err.message === "empty_cart") {
				return {
					success: false,
					message: "El carrito está vacío.",
					orderId: null,
				};
			}
			if (err.cause === "stock_insufficient") {
				return {
					success: false,
					message: err.message,
					orderId: null,
				};
			}
		}
		return {
			success: false,
			message: "Error al procesar el pedido.",
			orderId: null,
		};
	}
}
