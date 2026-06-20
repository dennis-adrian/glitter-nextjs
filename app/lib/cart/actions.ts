"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { guestCheckoutContactSchema } from "@/app/components/form/input-validators";
import { MAX_CART_LINE_QUANTITY } from "@/app/lib/constants";
import { BaseCart, CartWithItems } from "@/app/lib/cart/definitions";
import {
  createGuestOrderInTx,
  createOrderInTx,
  sendGuestOrderEmails,
  sendOrderEmails,
  type OrderLineInput,
} from "@/app/lib/orders/actions";
import { getProductPriceAtPurchase } from "@/app/lib/orders/utils";
import { fetchProduct } from "@/app/lib/products/actions";
import { getProductVariantStock } from "@/app/lib/products/variants";
import { getCurrentBaseProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { cartItems, carts } from "@/db/schema";

export type GuestCartItemInput = {
  lineKey: string;
  productId: number;
  productVariantId: number | null;
  quantity: number;
};

export type GuestStockValidationResult = {
  lineKey: string;
  productId: number;
  productVariantId: number | null;
  stock: number;
  isOutOfStock: boolean;
  quantityExceedsStock: boolean;
};

type CartTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CartCheckoutSnapshot = {
  cartId: number;
  items: {
    cartItemId: number;
    productId: number;
    productVariantId: number | null;
    quantity: number;
  }[];
};

export type CartLineInput = OrderLineInput;

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

async function resolveProductLine(input: CartLineInput) {
  const product = await fetchProduct(input.productId);
  if (!product) return null;

  const variant =
    input.productVariantId == null
      ? null
      : ((product.variants ?? []).find(
          (entry) => entry.id === input.productVariantId && entry.isVisible,
        ) ?? null);

  if (input.productVariantId != null && !variant) {
    return null;
  }

  if (input.productVariantId == null && (product.variants?.length ?? 0) > 0) {
    return null;
  }

  return { product, variant };
}

function buildCartItemWhere(
  cartId: number,
  productId: number,
  productVariantId: number | null,
) {
  return productVariantId == null
    ? and(
        eq(cartItems.cartId, cartId),
        eq(cartItems.productId, productId),
        isNull(cartItems.productVariantId),
      )
    : and(
        eq(cartItems.cartId, cartId),
        eq(cartItems.productId, productId),
        eq(cartItems.productVariantId, productVariantId),
      );
}

export async function validateGuestCartStock(
  items: GuestCartItemInput[],
): Promise<GuestStockValidationResult[]> {
  if (!items.length) return [];

  const results = await Promise.all(
    items.map(async (item) => {
      const resolved = await resolveProductLine({
        productId: item.productId,
        productVariantId: item.productVariantId,
        quantity: item.quantity,
      });

      const stock = resolved
        ? getProductVariantStock(resolved.product, resolved.variant)
        : 0;

      return {
        lineKey: item.lineKey,
        productId: item.productId,
        productVariantId: item.productVariantId,
        stock,
        isOutOfStock: stock === 0,
        quantityExceedsStock: stock > 0 && item.quantity > stock,
      };
    }),
  );

  return results;
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
          orderBy: (items, { asc }) => [asc(items.id)],
          with: {
            product: {
              with: {
                images: true,
                options: {
                  with: {
                    values: true,
                  },
                },
                variants: {
                  with: {
                    selections: {
                      with: {
                        option: true,
                        optionValue: true,
                      },
                    },
                  },
                },
              },
            },
            variant: {
              with: {
                selections: {
                  with: {
                    option: true,
                    optionValue: true,
                  },
                },
              },
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
  input: CartLineInput,
): Promise<{ success: boolean; newCount: number }> {
  try {
    const user = await getCurrentBaseProfile();
    if (!user) return { success: false, newCount: 0 };

    if (input.quantity <= 0) {
      const currentCount = await fetchCartItemCount();
      return { success: false, newCount: currentCount };
    }

    const resolved = await resolveProductLine(input);
    if (!resolved) {
      const currentCount = await fetchCartItemCount();
      return { success: false, newCount: currentCount };
    }

    const availableStock = getProductVariantStock(
      resolved.product,
      resolved.variant,
    );
    if (availableStock <= 0) {
      const currentCount = await fetchCartItemCount();
      return { success: false, newCount: currentCount };
    }

    const cart = await getOrCreateCart(user.id);
    const cappedQuantity = Math.min(
      input.quantity,
      MAX_CART_LINE_QUANTITY,
      availableStock,
    );
    if (cappedQuantity <= 0) {
      const currentCount = await fetchCartItemCount();
      return { success: false, newCount: currentCount };
    }

    const where = buildCartItemWhere(
      cart.id,
      input.productId,
      input.productVariantId ?? null,
    );
    const existing = await db.query.cartItems.findFirst({ where });

    if (existing) {
      const nextQuantity = Math.min(
        existing.quantity + cappedQuantity,
        MAX_CART_LINE_QUANTITY,
        availableStock,
      );
      await db
        .update(cartItems)
        .set({ quantity: nextQuantity, updatedAt: new Date() })
        .where(eq(cartItems.id, existing.id));
    } else {
      await db.insert(cartItems).values({
        cartId: cart.id,
        productId: input.productId,
        productVariantId: input.productVariantId ?? null,
        quantity: cappedQuantity,
      });
    }

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
  cartItemId: number,
  quantity: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentBaseProfile();
    if (!user) return { success: true };

    const cart = await db.query.carts.findFirst({
      where: eq(carts.userId, user.id),
    });
    if (!cart) return { success: true };

    const item = await db.query.cartItems.findFirst({
      where: and(eq(cartItems.id, cartItemId), eq(cartItems.cartId, cart.id)),
      with: {
        product: {
          with: {
            images: true,
          },
        },
        variant: {
          with: {
            selections: {
              with: {
                option: true,
                optionValue: true,
              },
            },
          },
        },
      },
    });
    if (!item) return { success: true };

    const capped = Math.min(quantity, MAX_CART_LINE_QUANTITY);
    if (capped > 0) {
      const availableStock = getProductVariantStock(item.product, item.variant);
      if (capped > availableStock) {
        return { success: false, error: "stock_insufficient" };
      }
    }

    if (capped <= 0) {
      await db.delete(cartItems).where(eq(cartItems.id, item.id));
    } else {
      await db
        .update(cartItems)
        .set({ quantity: capped, updatedAt: new Date() })
        .where(eq(cartItems.id, item.id));
    }

    revalidatePath("/store");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "No se pudo actualizar la cantidad" };
  }
}

export async function removeFromCart(
  cartItemId: number,
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
      .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.id, cartItemId)));

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
    .select({
      cartItemId: cartItems.id,
      productId: cartItems.productId,
      productVariantId: cartItems.productVariantId,
      quantity: cartItems.quantity,
    })
    .from(cartItems)
    .where(eq(cartItems.cartId, cart.id))
    .for("update");

  return {
    cartId: cart.id,
    items: rows.map((row) => ({
      cartItemId: row.cartItemId,
      productId: row.productId,
      productVariantId: row.productVariantId,
      quantity: row.quantity,
    })),
  };
}

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

      const result = await createOrderInTx(
        tx,
        snapshot.items.map((item) => ({
          productId: item.productId,
          productVariantId: item.productVariantId,
          quantity: item.quantity,
        })),
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
      if (
        err.cause === "variant_required" ||
        err.cause === "variant_unavailable"
      ) {
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

  const {
    name: nameTrimmed,
    email: emailTrimmed,
    phone: phoneTrimmed,
  } = contactParsed.data;

  try {
    const orderResult = await db.transaction((tx) =>
      createGuestOrderInTx(
        tx,
        items.map((item) => ({
          productId: item.productId,
          productVariantId: item.productVariantId,
          quantity: item.quantity,
        })),
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
    if (
      err instanceof Error &&
      (err.cause === "variant_required" || err.cause === "variant_unavailable")
    ) {
      return { success: false, message: err.message };
    }
    return { success: false, message: "Error al procesar el pedido." };
  }
}
