"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { guestCheckoutContactSchema } from "@/app/components/form/input-validators";
import { MAX_CART_LINE_QUANTITY } from "@/app/lib/constants";
import { BaseCart, CartWithItems } from "@/app/lib/cart/definitions";
import type { CartBundleLine } from "@/app/lib/merch/bundle-definitions";
import {
  buildBundleSelectionKey,
  stockResourceKey,
  type StockDemandLine,
} from "@/app/lib/merch/bundle-pricing";
import {
  bundleLineRequestSchema,
  MAX_CART_BUNDLE_QUANTITY,
  type BundleLineRequest,
} from "@/app/lib/merch/bundle-schema";
import {
  estimateBundleDemand,
  loadBundleRecords,
  loadCartBundleDemand,
  loadCartBundleRequests,
  resolveCartBundleLines,
} from "@/app/lib/merch/bundles";
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
import {
  isSuppliesPurchaseBlocked,
  SUPPLIES_UNVERIFIED_CAUSE,
  SUPPLIES_VERIFIED_MESSAGE,
} from "@/app/lib/store/category";
import { getCurrentBaseProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  cartBundleSelections,
  cartBundles,
  cartItems,
  carts,
  products,
} from "@/db/schema";

export type GuestCartItemInput = {
  lineKey: string;
  productId: number;
  productVariantId: number | null;
  quantity: number;
};

export type GuestBundleInput = BundleLineRequest & { lineKey: string };

const guestBundleInputSchema = z
  .array(bundleLineRequestSchema.extend({ lineKey: z.string().max(400) }))
  .max(20);

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
  bundles: BundleLineRequest[];
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
  bundleDemand: ReadonlyMap<string, number> = new Map(),
): Promise<number> {
  if (!product) return 0;

  // Bundles in the cart draw from the same sale stock as individual lines.
  const bundleUnits =
    getStockPoolForTransaction(product, transactionType) === "sale"
      ? (bundleDemand.get(stockResourceKey(product.id, variant?.id)) ?? 0)
      : 0;
  const poolStock =
    getAvailableStockForTransaction(product, variant, transactionType) -
    bundleUnits;

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

    return Math.max(
      0,
      getTransactionPoolRemainingStock(
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
      ) - bundleUnits,
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

async function loadGuestBundleDemand(bundles: readonly GuestBundleInput[]) {
  if (bundles.length === 0) return new Map<string, number>();
  const records = await loadBundleRecords(db, {
    ids: [...new Set(bundles.map((bundle) => bundle.bundleId))],
  });
  return estimateBundleDemand(bundles, records);
}

export async function validateGuestCartStock(
  items: GuestCartItemInput[],
  bundles: GuestBundleInput[] = [],
): Promise<GuestStockValidationResult[]> {
  if (!items.length) return [];
  const parsedBundles = guestBundleInputSchema.safeParse(bundles);
  const bundleDemand = await loadGuestBundleDemand(
    parsedBundles.success ? parsedBundles.data : [],
  );

  const results = await Promise.all(
    items.map(async (item) => {
      const resolved = await resolveProductLine({
        productId: item.productId,
        productVariantId: item.productVariantId,
        quantity: item.quantity,
      });

      const stock = resolved
        ? Math.max(
            0,
            getProductVariantStock(resolved.product, resolved.variant) -
              (bundleDemand.get(
                stockResourceKey(item.productId, item.productVariantId),
              ) ?? 0),
          )
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
    if (!cart) return { success: true, data: null };
    const bundles = await resolveCartBundleLines(
      await loadCartBundleRequests(db, cart.id),
      toSaleDemand(
        cart.items.map((item) => ({
          ...item,
          rentalStockMode: item.product.rentalStockMode,
        })),
      ),
    );
    return { success: true, data: { ...cart, bundles } };
  } catch (error) {
    console.error(error);
    return { success: false, data: null };
  }
}

/** Individual cart lines that draw from sale stock, as bundle demand input. */
function toSaleDemand(
  items: readonly {
    productId: number;
    productVariantId: number | null;
    quantity: number;
    transactionType: ProductTransactionType;
    rentalStockMode: "shared" | "separate";
  }[],
): StockDemandLine[] {
  return items
    .filter(
      (item) =>
        getStockPoolForTransaction(
          { stock: null, rentalStock: null, rentalStockMode: item.rentalStockMode },
          item.transactionType,
        ) === "sale",
    )
    .map((item) => ({
      productId: item.productId,
      productVariantId: item.productVariantId,
      quantity: item.quantity,
    }));
}

async function loadCartSaleDemand(cartId: number) {
  const rows = await db
    .select({
      productId: cartItems.productId,
      productVariantId: cartItems.productVariantId,
      quantity: cartItems.quantity,
      transactionType: cartItems.transactionType,
      rentalStockMode: products.rentalStockMode,
    })
    .from(cartItems)
    .innerJoin(products, eq(products.id, cartItems.productId))
    .where(eq(cartItems.cartId, cartId));
  return toSaleDemand(rows);
}

export async function fetchCartItemCount(): Promise<number> {
  try {
    const user = await getCurrentBaseProfile();
    if (!user) return 0;

    const cart = await db.query.carts.findFirst({
      where: eq(carts.userId, user.id),
      with: { items: true, bundles: true },
    });
    if (!cart) return 0;
    return (
      cart.items.reduce((sum, item) => sum + item.quantity, 0) +
      cart.bundles.reduce((sum, bundle) => sum + bundle.quantity, 0)
    );
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
      await loadCartBundleDemand(db, cart.id),
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
        await loadCartBundleDemand(db, cart.id),
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
    await db.delete(cartBundles).where(eq(cartBundles.cartId, cart.id));
    revalidatePath("/store");
    revalidatePath("/merch");
    revalidatePath("/supplies");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "No se pudo vaciar el carrito" };
  }
}

function revalidateCartViews() {
  revalidatePath("/store");
  revalidatePath("/merch");
  revalidatePath("/supplies");
}

async function findUserCart(userId: number) {
  return db.query.carts.findFirst({ where: eq(carts.userId, userId) });
}

/**
 * Resolves every bundle line of a cart, optionally overriding one line's
 * quantity first, so limits reflect the whole cart after the change.
 */
async function resolveUserCartBundles(
  cartId: number,
  override?: { cartBundleId: number; quantity: number },
) {
  const requests = (await loadCartBundleRequests(db, cartId)).map((request) =>
    override && request.cartBundleId === override.cartBundleId
      ? { ...request, quantity: override.quantity }
      : request,
  );
  return resolveCartBundleLines(requests, await loadCartSaleDemand(cartId));
}

export async function addBundleToCart(
  input: BundleLineRequest,
): Promise<{ success: boolean; newCount: number; message?: string }> {
  try {
    const user = await getCurrentBaseProfile();
    if (!user) return { success: false, newCount: 0 };
    const parsed = bundleLineRequestSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        newCount: await fetchCartItemCount(),
        message: "Revisá las opciones del combo.",
      };
    }
    const request = parsed.data;
    const closure = await resolveSectionClosure("merch");
    if (closure.closed) {
      return {
        success: false,
        newCount: await fetchCartItemCount(),
        message: storeClosureMessage(closure),
      };
    }

    const cart = await getOrCreateCart(user.id);
    const selectionKey = buildBundleSelectionKey(request.selections);
    const existing = await db.query.cartBundles.findFirst({
      where: and(
        eq(cartBundles.cartId, cart.id),
        eq(cartBundles.bundleId, request.bundleId),
        eq(cartBundles.selectionKey, selectionKey),
      ),
    });
    const existingQuantity = existing?.quantity ?? 0;
    const others = (await loadCartBundleRequests(db, cart.id)).filter(
      (entry) => entry.cartBundleId !== existing?.id,
    );
    const [line] = await resolveCartBundleLines(
      [
        {
          key: "incoming",
          cartBundleId: existing?.id ?? null,
          bundleId: request.bundleId,
          bundleVersion: request.bundleVersion,
          quantity: existingQuantity + request.quantity,
          selections: request.selections,
        },
        ...others,
      ],
      await loadCartSaleDemand(cart.id),
    );
    if (line.issue === "unavailable" || line.issue === "selection_invalid") {
      return {
        success: false,
        newCount: await fetchCartItemCount(),
        message: line.message ?? "Este combo ya no está disponible.",
      };
    }
    if (line.currentVersion !== request.bundleVersion) {
      return {
        success: false,
        newCount: await fetchCartItemCount(),
        message:
          "El combo cambió. Recargá la página para ver su precio y contenido actualizados.",
      };
    }
    const nextQuantity = Math.min(
      existingQuantity + request.quantity,
      MAX_CART_BUNDLE_QUANTITY,
      line.maxQuantity,
    );
    if (nextQuantity <= existingQuantity) {
      return {
        success: false,
        newCount: await fetchCartItemCount(),
        message:
          line.maxQuantity === 0
            ? "No hay stock disponible para este combo."
            : existingQuantity >= MAX_CART_BUNDLE_QUANTITY
              ? `Podés llevar hasta ${MAX_CART_BUNDLE_QUANTITY} unidades de este combo.`
              : "No hay más stock disponible para este combo.",
      };
    }

    await db.transaction(async (tx) => {
      const [saved] = await tx
        .insert(cartBundles)
        .values({
          cartId: cart.id,
          bundleId: request.bundleId,
          bundleVersion: request.bundleVersion,
          selectionKey,
          quantity: nextQuantity,
        })
        .onConflictDoUpdate({
          target: [
            cartBundles.cartId,
            cartBundles.bundleId,
            cartBundles.selectionKey,
          ],
          set: {
            quantity: nextQuantity,
            bundleVersion: request.bundleVersion,
            updatedAt: new Date(),
          },
        })
        .returning({ id: cartBundles.id });
      if (request.selections.length) {
        await tx
          .insert(cartBundleSelections)
          .values(
            request.selections.map((selection) => ({
              cartBundleId: saved.id,
              componentId: selection.componentId,
              productVariantId: selection.productVariantId,
            })),
          )
          .onConflictDoNothing();
      }
    });

    revalidateCartViews();
    const newCount = await fetchCartItemCount();
    return {
      success: true,
      newCount,
      message:
        nextQuantity < existingQuantity + request.quantity
          ? `Agregamos ${nextQuantity - existingQuantity} por el stock disponible.`
          : undefined,
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      newCount: await fetchCartItemCount(),
      message: "No se pudo agregar el combo al carrito.",
    };
  }
}

export async function updateCartBundleQuantity(
  cartBundleId: number,
  quantity: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentBaseProfile();
    if (!user) return { success: true };
    const cart = await findUserCart(user.id);
    if (!cart) return { success: true };
    const row = await db.query.cartBundles.findFirst({
      where: and(eq(cartBundles.id, cartBundleId), eq(cartBundles.cartId, cart.id)),
    });
    if (!row) return { success: true };

    if (!Number.isInteger(quantity) || quantity <= 0) {
      await db.delete(cartBundles).where(eq(cartBundles.id, row.id));
      revalidateCartViews();
      return { success: true };
    }
    const capped = Math.min(quantity, MAX_CART_BUNDLE_QUANTITY);
    if (capped > row.quantity) {
      const line = (
        await resolveUserCartBundles(cart.id, {
          cartBundleId: row.id,
          quantity: capped,
        })
      ).find((entry) => entry.cartBundleId === row.id);
      if (!line || (line.issue && line.issue !== "stock_insufficient")) {
        return {
          success: false,
          error: line?.message ?? "Este combo ya no está disponible.",
        };
      }
      if (capped > line.maxQuantity) {
        return { success: false, error: "stock_insufficient" };
      }
    }
    await db
      .update(cartBundles)
      .set({ quantity: capped, updatedAt: new Date() })
      .where(eq(cartBundles.id, row.id));
    revalidateCartViews();
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "No se pudo actualizar la cantidad" };
  }
}

export async function removeCartBundle(
  cartBundleId: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentBaseProfile();
    if (!user) return { success: true };
    const cart = await findUserCart(user.id);
    if (!cart) return { success: true };
    await db
      .delete(cartBundles)
      .where(
        and(eq(cartBundles.cartId, cart.id), eq(cartBundles.id, cartBundleId)),
      );
    revalidateCartViews();
    return { success: true };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      error: "No se pudo eliminar el combo del carrito",
    };
  }
}

/** Confirms the current price and contents of a bundle that changed. */
export async function acceptCartBundleChanges(
  cartBundleId: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentBaseProfile();
    if (!user) return { success: false, error: "Usuario no autenticado." };
    const cart = await findUserCart(user.id);
    if (!cart) return { success: false, error: "El carrito está vacío." };
    const line = (await resolveUserCartBundles(cart.id)).find(
      (entry) => entry.cartBundleId === cartBundleId,
    );
    if (!line) return { success: false, error: "El combo ya no está en tu carrito." };
    if (line.issue !== "stale" || line.currentVersion == null) {
      return {
        success: line.issue == null,
        error: line.message ?? undefined,
      };
    }
    await db
      .update(cartBundles)
      .set({ bundleVersion: line.currentVersion, updatedAt: new Date() })
      .where(
        and(eq(cartBundles.id, cartBundleId), eq(cartBundles.cartId, cart.id)),
      );
    revalidateCartViews();
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: "No se pudo actualizar el combo." };
  }
}

/** Resolves a guest cart's bundle lines with current prices and stock. */
export async function resolveGuestCartBundles(
  bundles: GuestBundleInput[],
  items: GuestCartItemInput[],
): Promise<CartBundleLine[]> {
  const parsed = guestBundleInputSchema.safeParse(bundles);
  if (!parsed.success || parsed.data.length === 0) return [];
  const itemDemand = z
    .array(
      z.object({
        productId: z.number().int().positive(),
        productVariantId: z.number().int().positive().nullable(),
        quantity: z.number().int().positive(),
      }),
    )
    .max(100)
    .safeParse(
      items.map((item) => ({
        productId: item.productId,
        productVariantId: item.productVariantId,
        quantity: item.quantity,
      })),
    );
  return resolveCartBundleLines(
    parsed.data.map((bundle) => ({
      key: bundle.lineKey,
      cartBundleId: null,
      bundleId: bundle.bundleId,
      bundleVersion: bundle.bundleVersion,
      quantity: bundle.quantity,
      selections: bundle.selections,
    })),
    itemDemand.success ? itemDemand.data : [],
  );
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

  const bundles = await loadCartBundleRequests(tx, cart.id, { lock: true });

  return {
    cartId: cart.id,
    bundles: bundles.map((bundle) => ({
      bundleId: bundle.bundleId,
      bundleVersion: bundle.bundleVersion,
      quantity: bundle.quantity,
      selections: bundle.selections,
    })),
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
  await tx.delete(cartBundles).where(eq(cartBundles.cartId, cartId));
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
      if (
        !snapshot ||
        (snapshot.items.length === 0 && snapshot.bundles.length === 0)
      ) {
        throw new Error("empty_cart");
      }

      const productIds = [
        ...new Set(snapshot.items.map((item) => item.productId)),
      ];
      const productRows = productIds.length
        ? await tx
            .select({
              id: products.id,
              storeCategory: products.storeCategory,
            })
            .from(products)
            .where(inArray(products.id, productIds))
        : [];
      if (
        productRows.some((product) =>
          isSuppliesPurchaseBlocked(product.storeCategory, user.status),
        )
      ) {
        throw new Error(SUPPLIES_VERIFIED_MESSAGE, {
          cause: SUPPLIES_UNVERIFIED_CAUSE,
        });
      }

      const closedSection = await findClosedSection([
        ...productRows.map((product) => product.storeCategory),
        // Bundles only contain merch.
        ...(snapshot.bundles.length ? (["merch"] as const) : []),
      ]);
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
        snapshot.bundles,
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
        err.cause === "variant_unavailable" ||
        err.cause === "bundle_unavailable" ||
        err.cause === "bundle_changed"
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
  bundles: GuestBundleInput[] = [],
): Promise<{
  success: boolean;
  message: string;
  orderId?: number | null;
  guestOrderToken?: string | null;
}> {
  if (!items.length && !bundles.length) {
    return { success: false, message: "El carrito está vacío." };
  }
  const parsedBundles = guestBundleInputSchema.safeParse(bundles);
  if (!parsedBundles.success) {
    return {
      success: false,
      message: "Revisá los combos de tu carrito.",
    };
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
    const productRows = items.length
      ? await db
          .select({ storeCategory: products.storeCategory })
          .from(products)
          .where(
            inArray(
              products.id,
              items.map((item) => item.productId),
            ),
          )
      : [];
    // Guests are never verified. Match registered checkout's precedence by
    // failing before the closure lookup; `createGuestOrderInTx` re-checks
    // against locked rows and stays authoritative.
    if (
      productRows.some((product) =>
        isSuppliesPurchaseBlocked(product.storeCategory, undefined),
      )
    ) {
      return { success: false, message: SUPPLIES_VERIFIED_MESSAGE };
    }
    const closedSection = await findClosedSection([
      ...productRows.map((product) => product.storeCategory),
      ...(parsedBundles.data.length ? (["merch"] as const) : []),
    ]);
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
        parsedBundles.data.map((bundle) => ({
          bundleId: bundle.bundleId,
          bundleVersion: bundle.bundleVersion,
          quantity: bundle.quantity,
          selections: bundle.selections,
        })),
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
      (err.cause === "variant_required" ||
        err.cause === "variant_unavailable" ||
        err.cause === "bundle_unavailable" ||
        err.cause === "bundle_changed" ||
        err.cause === SUPPLIES_UNVERIFIED_CAUSE)
    ) {
      return { success: false, message: err.message };
    }
    return { success: false, message: "Error al procesar el pedido." };
  }
}
