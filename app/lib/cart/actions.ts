"use server";

import { db } from "@/db";
import { cartItems, carts, products } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { guestCheckoutContactSchema } from "@/app/components/form/input-validators";
import {
	createOrderInTx,
	createGuestOrderInTx,
	sendOrderEmails,
	sendGuestOrderEmails,
} from "@/app/lib/orders/actions";
import { BaseCart, CartWithItems } from "@/app/lib/cart/definitions";
import { getCurrentBaseProfile } from "@/app/lib/users/helpers";
import { fetchProduct } from "@/app/lib/products/actions";
import { MAX_CART_LINE_QUANTITY } from "@/app/lib/constants";

export type GuestCartItemInput = {
	productId: number;
	quantity: number;
};

export type GuestStockValidationResult = {
	productId: number;
	stock: number | null;
	isOutOfStock: boolean;
	quantityExceedsStock: boolean;
};

export async function validateGuestCartStock(
	items: GuestCartItemInput[],
): Promise<GuestStockValidationResult[]> {
	if (!items.length) return [];

	const productIds = items.map((i) => i.productId);
	const rows = await db
		.select({ id: products.id, stock: products.stock })
		.from(products)
		.where(inArray(products.id, productIds));

	const stockMap = new Map(rows.map((r) => [r.id, r.stock]));

	return items.map((item) => {
		const stock = stockMap.get(item.productId) ?? null;
		return {
			productId: item.productId,
			stock,
			isOutOfStock: stock === 0,
			quantityExceedsStock:
				typeof stock === "number" && stock > 0 && item.quantity > stock,
		};
	});
}

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

export async function fetchCartWithItems(): Promise<{
	success: boolean;
	data: CartWithItems | null;
}> {
	try {
		const user = await getCurrentBaseProfile();
		if (!user) return { success: true, data: null };

		const cart = await db.query.carts.findFirst({
			where: eq(carts.userId, user.id),
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
		return { success: true, data: cart ?? null };
	} catch (error) {
		console.error(error);
		return { success: false, data: null };
	}
}

export async function fetchCartItemCount(): Promise<number> {
	try {
		const user = await getCurrentBaseProfile();
		if (!user) return 0;

		const cart = await db.query.carts.findFirst({
			where: eq(carts.userId, user.id),
			with: { items: true },
		});
		return cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
	} catch (error) {
		console.error(error);
		return 0;
	}
}

export async function addToCart(
	productId: number,
	quantity: number,
): Promise<{ success: boolean; newCount: number }> {
	try {
		const user = await getCurrentBaseProfile();
		if (!user) return { success: false, newCount: 0 };

		if (quantity <= 0) {
			const currentCount = await fetchCartItemCount();
			return { success: false, newCount: currentCount };
		}

		const product = await fetchProduct(productId);
		const availableStock = product?.stock ?? 0;
		if (availableStock <= 0) {
			const currentCount = await fetchCartItemCount();
			return { success: false, newCount: currentCount };
		}

		const cart = await getOrCreateCart(user.id);
		const cappedQuantity = Math.min(
			quantity,
			MAX_CART_LINE_QUANTITY,
			availableStock,
		);
		if (cappedQuantity <= 0) {
			const currentCount = await fetchCartItemCount();
			return { success: false, newCount: currentCount };
		}

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
					quantity: sql`least(${cartItems.quantity} + excluded.quantity, ${availableStock}, 5)`,
					updatedAt: new Date(),
				},
			});

		revalidatePath("/store");
		const newCount = await fetchCartItemCount();
		return { success: true, newCount };
	} catch (error) {
		console.error(error);
		const currentCount = await fetchCartItemCount();
		return { success: false, newCount: currentCount };
	}
}

export async function updateCartItemQuantity(
	productId: number,
	quantity: number,
): Promise<{ success: boolean; error?: string }> {
	try {
		const user = await getCurrentBaseProfile();
		if (!user) return { success: true };

		const cart = await db.query.carts.findFirst({
			where: eq(carts.userId, user.id),
		});
		if (!cart) return { success: true };

		const capped = Math.min(quantity, MAX_CART_LINE_QUANTITY);

		if (capped > 0) {
			const product = await fetchProduct(productId);
			const availableStock = product?.stock ?? 0;
			if (capped > availableStock) {
				return { success: false, error: "stock_insufficient" };
			}
		}

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
		return { success: true };
	} catch (error) {
		console.error(error);
		return { success: false, error: "No se pudo actualizar la cantidad" };
	}
}

export async function removeFromCart(
	productId: number,
): Promise<{ success: boolean; error?: string }> {
	try {
		const user = await getCurrentBaseProfile();
		if (!user) return { success: true };

		const cart = await db.query.carts.findFirst({
			where: eq(carts.userId, user.id),
		});
		if (!cart) return { success: true };

		await db
			.delete(cartItems)
			.where(
				and(eq(cartItems.cartId, cart.id), eq(cartItems.productId, productId)),
			);

		revalidatePath("/store");
		return { success: true };
	} catch (error) {
		console.error(error);
		return {
			success: false,
			error: "No se pudo eliminar el producto del carrito",
		};
	}
}

export async function clearCart(): Promise<{
	success: boolean;
	error?: string;
}> {
	try {
		const user = await getCurrentBaseProfile();
		if (!user) return { success: true };

		const cart = await db.query.carts.findFirst({
			where: eq(carts.userId, user.id),
		});
		if (!cart) return { success: true };

		await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
		revalidatePath("/store");
		return { success: true };
	} catch (error) {
		console.error(error);
		return { success: false, error: "No se pudo vaciar el carrito" };
	}
}

/** Locks the user's cart and cart_items in the current transaction. Returns null if no cart. DB-only; no auth/profile I/O. */
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
export async function clearCartInTx(tx: CartTx, cartId: number): Promise<void> {
	await tx.delete(cartItems).where(eq(cartItems.cartId, cartId));
}

export async function checkoutCart(): Promise<{
	success: boolean;
	message: string;
	orderId?: number | null;
	profileId?: number | null;
}> {
	try {
		const user = await getCurrentBaseProfile();
		if (!user) {
			return {
				success: false,
				message: "Usuario no autenticado.",
				orderId: null,
				profileId: null,
			};
		}

		const userId = user.id;
		const customerEmail = user.email;
		const customerName = user.displayName ?? user.firstName ?? "";

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

		revalidatePath("/store", "layout");
		return {
			success: true,
			message: "Orden creada correctamente.",
			orderId: orderResult.orderId,
			profileId: userId,
		};
	} catch (err) {
		console.error("checkoutCart error:", err);
		if (err instanceof Error) {
			if (err.message === "empty_cart") {
				return {
					success: false,
					message: "El carrito está vacío.",
					orderId: null,
					profileId: null,
				};
			}
			if (err.cause === "stock_insufficient") {
				return {
					success: false,
					message: err.message,
					orderId: null,
					profileId: null,
				};
			}
		}
		return {
			success: false,
			message: "Error al procesar el pedido.",
			orderId: null,
			profileId: null,
		};
	}
}

export async function checkoutGuestCart(
	items: GuestCartItemInput[],
	guestName: string,
	guestEmail: string,
	guestPhone: string,
): Promise<{
	success: boolean;
	message: string;
	orderId?: number | null;
	guestOrderToken?: string | null;
}> {
	if (!items.length) {
		return { success: false, message: "El carrito está vacío." };
	}

	const contactParsed = guestCheckoutContactSchema.safeParse({
		name: guestName,
		email: guestEmail,
		phone: guestPhone,
	});
	if (!contactParsed.success) {
		const message =
			contactParsed.error.issues[0]?.message ?? "Datos de contacto inválidos";
		return { success: false, message };
	}

	const { name: nameTrimmed, email: emailTrimmed, phone: phoneTrimmed } =
		contactParsed.data;

	try {
		const orderItemsMap = new Map<number, number>(
			items.map((i) => [i.productId, i.quantity]),
		);

		const orderResult = await db.transaction((tx) =>
			createGuestOrderInTx(
				tx,
				orderItemsMap,
				nameTrimmed,
				emailTrimmed,
				phoneTrimmed,
			),
		);

		try {
			await sendGuestOrderEmails({
				orderId: orderResult.orderId,
				guestOrderToken: orderResult.guestOrderToken,
				customerEmail: emailTrimmed,
				customerName: nameTrimmed,
				products: orderResult.mappedProducts,
				total: orderResult.totalAmount,
			});
		} catch (emailError) {
			console.error("Failed to send guest order emails", emailError);
		}

		return {
			success: true,
			message: "Orden creada correctamente.",
			orderId: orderResult.orderId,
			guestOrderToken: orderResult.guestOrderToken,
		};
	} catch (err) {
		console.error("checkoutGuestCart error:", err);
		if (err instanceof Error && err.cause === "stock_insufficient") {
			return { success: false, message: err.message };
		}
		return { success: false, message: "Error al procesar el pedido." };
	}
}
