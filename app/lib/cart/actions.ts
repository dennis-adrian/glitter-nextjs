"use server";

import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { guestCheckoutContactSchema } from "@/app/components/form/input-validators";
import {
  MAX_CART_LINE_QUANTITY,
  MAX_GUEST_CART_BUNDLE_LINES,
} from "@/app/lib/constants";
import {
  BaseCart,
  CartWithItems,
  type GuestCartBundle,
} from "@/app/lib/cart/definitions";
import { toGuestCartBundle } from "@/app/lib/cart/utils";
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
  cartBundleDemand,
  findExistingBundleIds,
  loadCartBundleDemand,
  loadCartBundleRequests,
  resolveCartBundleLines,
  type CartBundleRequest,
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

const guestBundleLineSchema = bundleLineRequestSchema.extend({
  lineKey: z.string().max(400),
});

const guestBundleInputSchema = z
  .array(guestBundleLineSchema)
  .max(MAX_GUEST_CART_BUNDLE_LINES);

export type GuestStockValidationResult = {
  lineKey: string;
  productId: number;
  productVariantId: number | null;
  /** Units this line may hold once the cart's bundles are served. */
  stock: number;
  isOutOfStock: boolean;
  quantityExceedsStock: boolean;
};

/** A guest cart as the server sees it: current prices, limits and flags. */
export type GuestCartResolution = {
  /** Every submitted bundle line whose bundle still exists. */
  bundles: CartBundleLine[];
  /** Individual lines' limits once the cart's bundles are served. */
  items: GuestStockValidationResult[];
  /** Lines whose bundle was deleted; the client drops them. */
  removedBundleKeys: string[];
};

export type GuestBundleAddResult =
  | { success: false; message: string }
  | {
      success: true;
      /** The line to keep, under its canonical key. */
      bundle: GuestCartBundle;
      /** Guest lines naming the same configuration, which it replaces. */
      replaces: string[];
      added: number;
      message?: string;
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

const GUEST_BUNDLE_INVALID_MESSAGE =
  "Este combo no es válido. Quitalo del carrito.";
const GUEST_BUNDLE_LIMIT_MESSAGE = `Tu carrito admite hasta ${MAX_GUEST_CART_BUNDLE_LINES} combos distintos. Quitá alguno para continuar.`;
/** Submitted guest bundle lines looked at at all, resolved or flagged. */
const MAX_GUEST_BUNDLE_INPUTS = 100;

const positiveIntegerOrZero = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : 0;

/**
 * A guest line the server will not resolve. It reveals nothing about the
 * bundle and blocks checkout until the guest removes it.
 */
function flaggedGuestBundleLine(
  entry: unknown,
  message: string,
): CartBundleLine | null {
  const candidate = (
    typeof entry === "object" && entry !== null ? entry : {}
  ) as Record<string, unknown>;
  // Without a usable key the client could not match the flag to its line.
  if (typeof candidate.lineKey !== "string" || candidate.lineKey.length > 400) {
    return null;
  }
  return {
    key: candidate.lineKey,
    cartBundleId: null,
    bundleId: positiveIntegerOrZero(candidate.bundleId),
    bundleVersion: positiveIntegerOrZero(candidate.bundleVersion),
    currentVersion: null,
    name: "Combo no disponible",
    slug: "",
    imageUrl: null,
    quantity: positiveIntegerOrZero(candidate.quantity),
    selections: [],
    unitPriceCents: 0,
    separateUnitPriceCents: 0,
    components: [],
    maxQuantity: 0,
    issue: "unavailable",
    message,
  };
}

/**
 * Validates guest bundle lines one by one, so a malformed line, or one past
 * the line limit, is flagged on its own while the rest still resolve.
 */
function parseGuestBundles(bundles: unknown): {
  requests: CartBundleRequest[];
  flagged: CartBundleLine[];
} {
  const entries = Array.isArray(bundles)
    ? bundles.slice(0, MAX_GUEST_BUNDLE_INPUTS)
    : [];
  const requests: CartBundleRequest[] = [];
  const flagged: CartBundleLine[] = [];
  for (const entry of entries) {
    const parsed = guestBundleLineSchema.safeParse(entry);
    if (parsed.success && requests.length < MAX_GUEST_CART_BUNDLE_LINES) {
      requests.push({
        key: parsed.data.lineKey,
        cartBundleId: null,
        bundleId: parsed.data.bundleId,
        bundleVersion: parsed.data.bundleVersion,
        quantity: parsed.data.quantity,
        selections: parsed.data.selections,
      });
      continue;
    }
    const line = flaggedGuestBundleLine(
      entry,
      parsed.success
        ? GUEST_BUNDLE_LIMIT_MESSAGE
        : GUEST_BUNDLE_INVALID_MESSAGE,
    );
    if (line) flagged.push(line);
  }
  return { requests, flagged };
}

/** Guest individual lines as bundle stock demand (guests cannot rent). */
function parseGuestItemDemand(
  items: readonly GuestCartItemInput[],
): StockDemandLine[] {
  const parsed = z
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
  return parsed.success ? parsed.data : [];
}

/**
 * Resolves a guest cart on the server: bundle lines with current prices,
 * stock limits and flags, and each individual line's limit once the bundles
 * that can be checked out are served (and vice versa).
 */
export async function resolveGuestCart(
  bundles: GuestBundleInput[],
  items: GuestCartItemInput[],
): Promise<GuestCartResolution> {
  const { requests, flagged } = parseGuestBundles(bundles);
  const [lines, existing] = await Promise.all([
    resolveCartBundleLines(requests, parseGuestItemDemand(items)),
    findExistingBundleIds(
      db,
      requests.map((request) => request.bundleId),
    ),
  ]);
  const kept = lines.filter((line) => existing.has(line.bundleId));
  return {
    bundles: [...kept, ...flagged],
    items: await checkGuestItemStock(items, cartBundleDemand(kept)),
    removedBundleKeys: lines
      .filter((line) => !existing.has(line.bundleId))
      .map((line) => line.key),
  };
}

export async function validateGuestCartStock(
  items: GuestCartItemInput[],
  bundles: GuestBundleInput[] = [],
): Promise<GuestStockValidationResult[]> {
  if (!items.length) return [];
  return (await resolveGuestCart(bundles, items)).items;
}

async function checkGuestItemStock(
  items: GuestCartItemInput[],
  bundleDemand: ReadonlyMap<string, number>,
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
          {
            stock: null,
            rentalStock: null,
            rentalStockMode: item.rentalStockMode,
          },
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

const INCOMING_BUNDLE_KEY = "incoming";

type BundleAddPlan =
  | { ok: false; message: string }
  | {
      ok: true;
      /** The incoming configuration, resolved; its choices are canonical. */
      line: CartBundleLine;
      /** Cart lines naming the same configuration; they become one line. */
      matches: CartBundleLine[];
      /** Quantity of the merged line. */
      quantity: number;
      added: number;
      message?: string;
    };

/** Whether two resolved lines name the same configuration of one bundle. */
function sameConfiguration(a: CartBundleLine, b: CartBundleLine) {
  return (
    a.bundleId === b.bundleId &&
    b.issue !== "unavailable" &&
    b.issue !== "selection_invalid" &&
    buildBundleSelectionKey(a.selections) ===
      buildBundleSelectionKey(b.selections)
  );
}

/**
 * Decides how an add-to-cart lands in a cart, authenticated or guest: which
 * lines it merges with (by canonical configuration, not by how the choices
 * were sent) and how many units the per-line cap and shared stock allow.
 */
async function planBundleAdd(
  request: BundleLineRequest,
  cartRequests: readonly CartBundleRequest[],
  individualDemand: readonly StockDemandLine[],
): Promise<BundleAddPlan> {
  const [line, ...current] = await resolveCartBundleLines(
    [
      { key: INCOMING_BUNDLE_KEY, cartBundleId: null, ...request },
      ...cartRequests,
    ],
    individualDemand,
  );
  if (line.issue === "unavailable" || line.issue === "selection_invalid") {
    return {
      ok: false,
      message: line.message ?? "Este combo ya no está disponible.",
    };
  }
  if (line.currentVersion !== request.bundleVersion) {
    return {
      ok: false,
      message:
        "El combo cambió. Recargá la página para ver su precio y contenido actualizados.",
    };
  }
  const matches = current.filter((entry) => sameConfiguration(line, entry));
  // Adding units never confirms a new price for the ones already there.
  if (matches.some((entry) => entry.bundleVersion !== entry.currentVersion)) {
    return {
      ok: false,
      message:
        "Este combo cambió desde que lo agregaste. Confirmá su precio actual en el carrito antes de agregar más.",
    };
  }
  const existingQuantity = matches.reduce(
    (sum, entry) => sum + entry.quantity,
    0,
  );
  // Matches hold the same components, so what stock leaves for the incoming
  // line (which counted them as other demand) is what the merged line adds.
  const limit = existingQuantity + line.maxQuantity;
  const quantity = Math.min(
    existingQuantity + request.quantity,
    MAX_CART_BUNDLE_QUANTITY,
    limit,
  );
  if (quantity <= existingQuantity) {
    return {
      ok: false,
      message:
        limit === 0
          ? "No hay stock disponible para este combo."
          : existingQuantity >= MAX_CART_BUNDLE_QUANTITY
            ? `Podés llevar hasta ${MAX_CART_BUNDLE_QUANTITY} unidades de este combo.`
            : "No hay más stock disponible para este combo.",
    };
  }
  const added = quantity - existingQuantity;
  return {
    ok: true,
    line,
    matches,
    quantity,
    added,
    message:
      added < request.quantity
        ? `Agregamos ${added} por el stock disponible.`
        : undefined,
  };
}

/** Rewrites a stored line's choices to the canonical ones. */
async function replaceCartBundleSelections(
  tx: CartTx,
  cartBundleId: number,
  selections: CartBundleLine["selections"],
) {
  await tx
    .delete(cartBundleSelections)
    .where(eq(cartBundleSelections.cartBundleId, cartBundleId));
  if (selections.length) {
    await tx.insert(cartBundleSelections).values(
      selections.map((selection) => ({
        cartBundleId,
        componentId: selection.componentId,
        productVariantId: selection.productVariantId,
      })),
    );
  }
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
    const plan = await planBundleAdd(
      request,
      await loadCartBundleRequests(db, cart.id),
      await loadCartSaleDemand(cart.id),
    );
    if (!plan.ok) {
      return {
        success: false,
        newCount: await fetchCartItemCount(),
        message: plan.message,
      };
    }

    const selectionKey = buildBundleSelectionKey(plan.line.selections);
    const [target, ...duplicates] = plan.matches;
    await db.transaction(async (tx) => {
      if (duplicates.length) {
        await tx.delete(cartBundles).where(
          and(
            eq(cartBundles.cartId, cart.id),
            inArray(
              cartBundles.id,
              duplicates.map((entry) => entry.cartBundleId!),
            ),
          ),
        );
      }
      if (target) {
        // Also re-keys a line stored under a non-canonical key.
        await tx
          .update(cartBundles)
          .set({ quantity: plan.quantity, selectionKey, updatedAt: new Date() })
          .where(eq(cartBundles.id, target.cartBundleId!));
        await replaceCartBundleSelections(
          tx,
          target.cartBundleId!,
          plan.line.selections,
        );
        return;
      }
      const [saved] = await tx
        .insert(cartBundles)
        .values({
          cartId: cart.id,
          bundleId: request.bundleId,
          bundleVersion: request.bundleVersion,
          selectionKey,
          quantity: plan.quantity,
        })
        .onConflictDoUpdate({
          target: [
            cartBundles.cartId,
            cartBundles.bundleId,
            cartBundles.selectionKey,
          ],
          set: { quantity: plan.quantity, updatedAt: new Date() },
        })
        .returning({ id: cartBundles.id });
      if (plan.line.selections.length) {
        await tx
          .insert(cartBundleSelections)
          .values(
            plan.line.selections.map((selection) => ({
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
    return { success: true, newCount, message: plan.message };
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
      where: and(
        eq(cartBundles.id, cartBundleId),
        eq(cartBundles.cartId, cart.id),
      ),
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

/**
 * Confirms the current price and contents of a bundle that changed, but only
 * the version the customer was shown: if it changed again since, nothing is
 * confirmed. A line that now names the same configuration as another current
 * line (e.g. a choice became fixed) merges into one.
 */
export async function acceptCartBundleChanges(
  cartBundleId: number,
  shownVersion: number,
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    const user = await getCurrentBaseProfile();
    if (!user) return { success: false, error: "Usuario no autenticado." };
    const cart = await findUserCart(user.id);
    if (!cart) return { success: false, error: "El carrito está vacío." };
    const lines = await resolveUserCartBundles(cart.id);
    const line = lines.find((entry) => entry.cartBundleId === cartBundleId);
    if (!line)
      return { success: false, error: "El combo ya no está en tu carrito." };
    if (line.issue !== "stale" || line.currentVersion == null) {
      return {
        success: line.issue == null,
        error: line.message ?? undefined,
      };
    }
    const currentVersion = line.currentVersion;
    if (currentVersion !== shownVersion) {
      return {
        success: false,
        error: "El combo volvió a cambiar. Revisá el nuevo precio.",
      };
    }

    const selectionKey = buildBundleSelectionKey(line.selections);
    const matches = lines.filter(
      (entry) =>
        entry !== line &&
        entry.bundleVersion === currentVersion &&
        sameConfiguration(line, entry),
    );
    const combined = matches.reduce(
      (sum, entry) => sum + entry.quantity,
      line.quantity,
    );
    const quantity = Math.min(combined, MAX_CART_BUNDLE_QUANTITY);
    await db.transaction(async (tx) => {
      if (matches.length) {
        await tx.delete(cartBundles).where(
          and(
            eq(cartBundles.cartId, cart.id),
            inArray(
              cartBundles.id,
              matches.map((entry) => entry.cartBundleId!),
            ),
          ),
        );
      }
      // A line that still waits for its own confirmation may hold the
      // canonical key; this one keeps its key until they merge.
      const [holder] = await tx
        .select({ id: cartBundles.id })
        .from(cartBundles)
        .where(
          and(
            eq(cartBundles.cartId, cart.id),
            eq(cartBundles.bundleId, line.bundleId),
            eq(cartBundles.selectionKey, selectionKey),
            ne(cartBundles.id, cartBundleId),
          ),
        );
      await tx
        .update(cartBundles)
        .set({
          bundleVersion: currentVersion,
          quantity,
          ...(holder ? {} : { selectionKey }),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(cartBundles.id, cartBundleId),
            eq(cartBundles.cartId, cart.id),
          ),
        );
      if (!holder) {
        await replaceCartBundleSelections(tx, cartBundleId, line.selections);
      }
    });
    revalidateCartViews();
    return {
      success: true,
      message:
        combined > quantity
          ? `Juntamos las líneas iguales de este combo. Podés llevar hasta ${MAX_CART_BUNDLE_QUANTITY} unidades.`
          : undefined,
    };
  } catch (error) {
    console.error(error);
    return { success: false, error: "No se pudo actualizar el combo." };
  }
}

/**
 * Plans a guest add-to-cart with the same rules as `addBundleToCart`: the
 * client stores the returned line and drops the lines it replaces.
 */
export async function planGuestBundleAdd(
  input: BundleLineRequest,
  bundles: GuestBundleInput[],
  items: GuestCartItemInput[],
): Promise<GuestBundleAddResult> {
  try {
    const parsed = bundleLineRequestSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, message: "Revisá las opciones del combo." };
    }
    const closure = await resolveSectionClosure("merch");
    if (closure.closed) {
      return { success: false, message: storeClosureMessage(closure) };
    }
    const plan = await planBundleAdd(
      parsed.data,
      parseGuestBundles(bundles).requests,
      parseGuestItemDemand(items),
    );
    if (!plan.ok) return { success: false, message: plan.message };
    if (
      plan.matches.length === 0 &&
      bundles.length >= MAX_GUEST_CART_BUNDLE_LINES
    ) {
      return {
        success: false,
        message: `Podés tener hasta ${MAX_GUEST_CART_BUNDLE_LINES} combos distintos en el carrito.`,
      };
    }
    return {
      success: true,
      bundle: toGuestCartBundle(plan.line, { quantity: plan.quantity }),
      replaces: plan.matches.map((entry) => entry.key),
      added: plan.added,
      message: plan.message,
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "No se pudo agregar el combo al carrito.",
    };
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
