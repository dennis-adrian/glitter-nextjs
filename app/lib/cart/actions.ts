"use server";

import { db } from "@/db";
import { cartItems, carts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createOrder } from "@/app/lib/orders/actions";
import { BaseCart, CartWithItems } from "@/app/lib/cart/definitions";

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
		const cart = await getOrCreateCart(userId);

		const existing = await db.query.cartItems.findFirst({
			where: and(
				eq(cartItems.cartId, cart.id),
				eq(cartItems.productId, productId),
			),
		});

		if (existing) {
			const newQty = Math.min(existing.quantity + quantity, 5);
			await db
				.update(cartItems)
				.set({ quantity: newQty, updatedAt: new Date() })
				.where(eq(cartItems.id, existing.id));
		} else {
			await db.insert(cartItems).values({
				cartId: cart.id,
				productId,
				quantity: Math.min(quantity, 5),
			});
		}

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

export async function checkoutCart(
	userId: number,
	customerEmail: string,
	customerName: string,
): Promise<{
	success: boolean;
	message: string;
	orderId?: number | null;
}> {
	const cart = await fetchCartWithItems(userId);

	if (!cart || cart.items.length === 0) {
		return {
			success: false,
			message: "El carrito está vacío.",
		};
	}

	const orderItemsMap = new Map<number, number>(
		cart.items.map((item) => [item.productId, item.quantity]),
	);

	try {
		const result = await createOrder(
			orderItemsMap,
			userId,
			customerEmail,
			customerName,
		);

		if (result.success) {
			await clearCart(userId);
		}

		return {
			success: result.success,
			message: result.message,
			orderId: result.details?.orderId ?? null,
		};
	} catch (err) {
		console.error("checkoutCart error:", err);
		return {
			success: false,
			message: "Error al procesar el pedido.",
		};
	}
}
