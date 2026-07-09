"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { guestCheckoutContactSchema } from "@/app/components/form/input-validators";
import { MAX_CART_LINE_QUANTITY } from "@/app/lib/constants";
import { BaseCart, CartWithItems } from "@/app/lib/cart/definitions";
import {
  BaseProduct,
  ProductVariantWithSelections,
} from "@/app/lib/products/definitions";
import {
  createGuestOrderInTx,
  createOrderInTx,
  sendGuestOrderEmails,
  sendOrderEmails,
  type OrderLineInput,
} from "@/app/lib/orders/actions";
import { fetchProduct } from "@/app/lib/products/actions";
import { getProductVariantStock } from "@/app/lib/products/variants";
import { assertRentalEligibility } from "@/app/lib/rentals/eligibility";
import { resolveRentalLineContext } from "@/app/lib/rentals/rental-context";
import {
  getAvailableStockForTransaction,
  getStockPoolForTransaction,
  getTransactionPoolRemainingStock,
  usesSharedRentalStock,
} from "@/app/lib/rentals/stock";
import type {
  ProductTransactionType,
  RentalEligibilityContext,
} from "@/app/lib/rentals/types";
import {
  findClosedSection,
  resolveSectionClosure,
  storeClosureMessage,
} from "@/app/lib/store_settings/closure";
import { getCurrentBaseProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { cartItems, carts, products } from "@/db/schema";

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

const SUPPLIES_VERIFIED_MESSAGE =
  "Los insumos requieren una cuenta verificada.";

function isSuppliesPurchaseBlocked(
  storeCategory: string | null | undefined,
  userStatus: string | undefined,
): boolean {
  return storeCategory === "supplies" && userStatus !== "verified";
}

export type CartCheckoutSnapshot = {
  cartId: number;
  items: {
    cartItemId: number;
    productId: number;
    productVariantId: number | null;
    quantity: number;
    transactionType: ProductTransactionType;
    rentalFestivalId: number | null;
    rentalReservationId: number | null;
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
  transactionType: ProductTransactionType = "purchase",
) {
  const base =
    productVariantId == null
      ? and(
          eq(cartItems.cartId, cartId),
          eq(cartItems.productId, productId),
          isNull(cartItems.productVariantId),
          eq(cartItems.transactionType, transactionType),
        )
      : and(
          eq(cartItems.cartId, cartId),
          eq(cartItems.productId, productId),
          eq(cartItems.productVariantId, productVariantId),
          eq(cartItems.transactionType, transactionType),
        );

  return base;
}

async function getCartStockLimit(
  cartId: number,
  product: Pick<
    BaseProduct,
    "id" | "stock" | "rentalStock" | "rentalStockMode"
  >,
  variant: Pick<
    ProductVariantWithSelections,
    "id" | "stock" | "rentalStock"
  > | null,
  transactionType: ProductTransactionType,
  excludeCartItemId?: number,
): Promise<number> {
  if (!product) return 0;

  const poolStock = getAvailableStockForTransaction(
    product,
    variant,
    transactionType,
  );

  if (!usesSharedRentalStock(product)) {
    const cartItemsForProduct = await db.query.cartItems.findMany({
      where: and(
        eq(cartItems.cartId, cartId),
        eq(cartItems.productId, product.id),
        eq(cartItems.transactionType, transactionType),
        variant?.id != null
          ? eq(cartItems.productVariantId, variant.id)
          : isNull(cartItems.productVariantId),
      ),
    });

    return getTransactionPoolRemainingStock(
      product,
      variant,
      transactionType,
      cartItemsForProduct.map((item) => ({
        id: item.id,
        productId: item.productId,
        productVariantId: item.productVariantId,
        transactionType: item.transactionType,
        quantity: item.quantity,
      })),
      {
        id: excludeCartItemId,
        productId: product.id,
        productVariantId: variant?.id ?? null,
      },
    );
  }

  const cartItemsForProduct = await db.query.cartItems.findMany({
    where: and(
      eq(cartItems.cartId, cartId),
      eq(cartItems.productId, product.id),
      variant?.id != null
        ? eq(cartItems.productVariantId, variant.id)
        : isNull(cartItems.productVariantId),
    ),
  });

  const sharedDemand = cartItemsForProduct
    .filter((item) => {
      if (excludeCartItemId != null && item.id === excludeCartItemId) {
        return false;
      }
      return (
        getStockPoolForTransaction(product, item.transactionType) === "sale"
      );
    })
    .reduce((sum, item) => sum + item.quantity, 0);

  return Math.max(0, poolStock - sharedDemand);
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
): Promise<{ success: boolean; newCount: number; message?: string }> {
  try {
    const user = await getCurrentBaseProfile();
    if (!user) return { success: false, newCount: 0 };

    const transactionType = input.transactionType ?? "purchase";
    let rentalFestivalId: number | null = null;
    let rentalReservationId: number | null = null;
    let eligibleRentalContexts: RentalEligibilityContext[] = [];

    if (transactionType === "rental") {
      const eligibility = await assertRentalEligibility(
        user.id,
        input.rentalFestivalId ?? undefined,
        input.rentalReservationId ?? undefined,
      );
      if (!eligibility.eligible) {
        return {
          success: false,
          newCount: await fetchCartItemCount(),
          message: eligibility.message,
        };
      }
      eligibleRentalContexts = eligibility.contexts;

      const resolvedContext = resolveRentalLineContext(
        eligibility.contexts,
        input.rentalFestivalId,
        input.rentalReservationId,
      );
      if (!resolvedContext.ok) {
        return {
          success: false,
          newCount: await fetchCartItemCount(),
          message: resolvedContext.message,
        };
      }
      rentalFestivalId = resolvedContext.context.festivalId;
      rentalReservationId = resolvedContext.context.reservationId;
    }

    if (input.quantity <= 0) {
      const currentCount = await fetchCartItemCount();
      return { success: false, newCount: currentCount };
    }

    const resolved = await resolveProductLine(input);
    if (!resolved) {
      const currentCount = await fetchCartItemCount();
      return { success: false, newCount: currentCount };
    }

    if (
      isSuppliesPurchaseBlocked(resolved.product.storeCategory, user.status)
    ) {
      return {
        success: false,
        newCount: await fetchCartItemCount(),
        message: SUPPLIES_VERIFIED_MESSAGE,
      };
    }

    const sectionClosure = await resolveSectionClosure(
      resolved.product.storeCategory,
    );
    if (sectionClosure.closed) {
      return {
        success: false,
        newCount: await fetchCartItemCount(),
        message: storeClosureMessage(sectionClosure),
      };
    }

    if (transactionType === "purchase" && !resolved.product.isPurchasable) {
      return {
        success: false,
        newCount: await fetchCartItemCount(),
        message: "Este producto no está disponible para compra.",
      };
    }

    if (transactionType === "rental" && !resolved.product.isRentable) {
      return {
        success: false,
        newCount: await fetchCartItemCount(),
        message: "Este producto no está disponible para alquiler.",
      };
    }

    const cart = await getOrCreateCart(user.id);

    if (transactionType === "rental") {
      const existingRentalItems = await db.query.cartItems.findMany({
        where: and(
          eq(cartItems.cartId, cart.id),
          eq(cartItems.transactionType, "rental"),
        ),
      });
      const conflictingContext = existingRentalItems.find(
        (entry) => entry.rentalFestivalId !== rentalFestivalId,
      );
      if (conflictingContext) {
        return {
          success: false,
          newCount: await fetchCartItemCount(),
          message:
            "Todos los productos de alquiler deben usar el mismo festival.",
        };
      }

      const existingContext = existingRentalItems.find(
        (entry) =>
          entry.rentalFestivalId === rentalFestivalId &&
          entry.rentalReservationId != null,
      );
      if (existingContext?.rentalReservationId != null) {
        const existingResolvedContext = resolveRentalLineContext(
          eligibleRentalContexts,
          rentalFestivalId,
          existingContext.rentalReservationId,
        );
        if (existingResolvedContext.ok) {
          rentalReservationId = existingResolvedContext.context.reservationId;
        }
      }
    }

    const where = buildCartItemWhere(
      cart.id,
      input.productId,
      input.productVariantId ?? null,
      transactionType,
    );
    const existing = await db.query.cartItems.findFirst({ where });

    const lineStockCap = await getCartStockLimit(
      cart.id,
      resolved.product,
      resolved.variant,
      transactionType,
      existing?.id,
    );

    if (lineStockCap <= 0) {
      const currentCount = await fetchCartItemCount();
      return {
        success: false,
        newCount: currentCount,
        message: "No hay stock disponible.",
      };
    }

    const cappedQuantity = Math.min(
      input.quantity,
      MAX_CART_LINE_QUANTITY,
      existing ? lineStockCap - existing.quantity : lineStockCap,
    );
    if (cappedQuantity <= 0) {
      const currentCount = await fetchCartItemCount();
      return {
        success: false,
        newCount: currentCount,
        message: "No hay stock disponible.",
      };
    }

    if (existing) {
      const nextQuantity = Math.min(
        existing.quantity + cappedQuantity,
        MAX_CART_LINE_QUANTITY,
        lineStockCap,
      );
      await db
        .update(cartItems)
        .set({
          quantity: nextQuantity,
          rentalFestivalId:
            transactionType === "rental" ? rentalFestivalId : null,
          rentalReservationId:
            transactionType === "rental" ? rentalReservationId : null,
          updatedAt: new Date(),
        })
        .where(eq(cartItems.id, existing.id));
    } else {
      await db.insert(cartItems).values({
        cartId: cart.id,
        productId: input.productId,
        productVariantId: input.productVariantId ?? null,
        quantity: cappedQuantity,
        transactionType,
        rentalFestivalId:
          transactionType === "rental" ? rentalFestivalId : null,
        rentalReservationId:
          transactionType === "rental" ? rentalReservationId : null,
      });
    }

    revalidatePath("/store");
    revalidatePath("/merch");
    revalidatePath("/supplies");
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
      const availableStock = await getCartStockLimit(
        cart.id,
        item.product,
        item.variant,
        item.transactionType,
        item.id,
      );
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
    revalidatePath("/merch");
    revalidatePath("/supplies");
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
    revalidatePath("/merch");
    revalidatePath("/supplies");
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
    revalidatePath("/merch");
    revalidatePath("/supplies");
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
      transactionType: cartItems.transactionType,
      rentalFestivalId: cartItems.rentalFestivalId,
      rentalReservationId: cartItems.rentalReservationId,
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
      transactionType: row.transactionType,
      rentalFestivalId: row.rentalFestivalId,
      rentalReservationId: row.rentalReservationId,
    })),
  };
}

export async function clearCartInTx(tx: CartTx, cartId: number): Promise<void> {
  await tx.delete(cartItems).where(eq(cartItems.cartId, cartId));
}

export async function checkoutCart(input?: {
  rentalFestivalId?: number | null;
  rentalReservationId?: number | null;
}): Promise<{
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

      const productIds = [
        ...new Set(snapshot.items.map((item) => item.productId)),
      ];
      const productRows = await tx
        .select({
          id: products.id,
          storeCategory: products.storeCategory,
        })
        .from(products)
        .where(inArray(products.id, productIds));
      if (
        productRows.some((product) =>
          isSuppliesPurchaseBlocked(product.storeCategory, user.status),
        )
      ) {
        throw new Error(SUPPLIES_VERIFIED_MESSAGE, {
          cause: "supplies_unverified",
        });
      }

      const closedSection = await findClosedSection(
        productRows.map((product) => product.storeCategory),
      );
      if (closedSection) {
        throw new Error(storeClosureMessage(closedSection.closure), {
          cause: "store_closed",
        });
      }

      const rentalItems = snapshot.items.filter(
        (item) => item.transactionType === "rental",
      );
      if (rentalItems.length > 0) {
        const [sampleRentalItem] = rentalItems;
        const persistedContexts = new Set(
          rentalItems.map((item) => item.rentalFestivalId),
        );
        if (persistedContexts.size > 1) {
          throw new Error(
            "Todos los productos de alquiler deben usar el mismo festival.",
            { cause: "multiple_rental_contexts" },
          );
        }

        const checkoutFestivalId = sampleRentalItem.rentalFestivalId;
        const checkoutReservationId = sampleRentalItem.rentalReservationId;
        if (checkoutFestivalId == null || checkoutReservationId == null) {
          throw new Error("Selecciona un festival para alquilar.", {
            cause: "rental_context_required",
          });
        }

        const requestedFestivalId = input?.rentalFestivalId ?? null;
        const requestedReservationId = input?.rentalReservationId ?? null;
        const hasRequestedContext =
          requestedFestivalId != null || requestedReservationId != null;
        if (
          hasRequestedContext &&
          (requestedFestivalId == null ||
            requestedReservationId == null ||
            requestedFestivalId !== checkoutFestivalId)
        ) {
          throw new Error(
            "El contexto de alquiler del carrito cambió. Vuelve a agregar los productos de alquiler.",
            { cause: "invalid_rental_context" },
          );
        }

        const validationFestivalId = requestedFestivalId ?? checkoutFestivalId;
        const validationReservationId =
          requestedReservationId ?? checkoutReservationId;
        const eligibility = await assertRentalEligibility(
          userId,
          validationFestivalId,
          validationReservationId,
        );
        if (!eligibility.eligible) {
          throw new Error(eligibility.message, { cause: "rental_ineligible" });
        }

        const resolvedContext = resolveRentalLineContext(
          eligibility.contexts,
          validationFestivalId,
          validationReservationId,
        );
        if (!resolvedContext.ok) {
          throw new Error(resolvedContext.message, {
            cause: resolvedContext.cause,
          });
        }

        for (const item of rentalItems) {
          item.rentalFestivalId = resolvedContext.context.festivalId;
          item.rentalReservationId = resolvedContext.context.reservationId;
        }
      }

      const result = await createOrderInTx(
        tx,
        snapshot.items.map((item) => {
          const rentalFestivalId =
            item.transactionType === "rental"
              ? (item.rentalFestivalId ?? null)
              : null;
          const rentalReservationId =
            item.transactionType === "rental"
              ? (item.rentalReservationId ?? null)
              : null;

          return {
            productId: item.productId,
            productVariantId: item.productVariantId,
            quantity: item.quantity,
            transactionType: item.transactionType,
            rentalFestivalId,
            rentalReservationId,
          };
        }),
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
    revalidatePath("/merch", "layout");
    revalidatePath("/supplies", "layout");
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
      if (
        err.cause === "rental_ineligible" ||
        err.cause === "rental_context_required" ||
        err.cause === "invalid_rental_context" ||
        err.cause === "multiple_rental_contexts" ||
        err.cause === "supplies_unverified" ||
        err.cause === "store_closed"
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

  if (items.some((item) => item.lineKey.endsWith(":rental"))) {
    return {
      success: false,
      message: "Los productos de alquiler requieren una cuenta verificada.",
    };
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
    const productRows = await db
      .select({ storeCategory: products.storeCategory })
      .from(products)
      .where(
        inArray(
          products.id,
          items.map((item) => item.productId),
        ),
      );
    const closedSection = await findClosedSection(
      productRows.map((product) => product.storeCategory),
    );
    if (closedSection) {
      return {
        success: false,
        message: storeClosureMessage(closedSection.closure),
      };
    }

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
