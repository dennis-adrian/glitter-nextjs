import "server-only";

import { sql, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  orderBundleItems,
  orderBundles,
  orderEvents,
  orderItems,
  orders,
  productContentSections,
  products,
  productVariantOptionValues,
  productVariants,
} from "@/db/schema";
import { getVariantLabel } from "@/app/lib/products/variants";
import { loadBundleCatalog } from "@/app/lib/merch/bundles";
import {
  bundleComponentStockErrors,
  bundleDemandLines,
  bundleLockTargets,
  describeOrderBundle,
  lockBundleRecordsForCheckout,
  planBundleOrderItems,
  resolveOrderBundles,
  type BundleOrderRequest,
  type ResolvedOrderBundle,
} from "@/app/lib/orders/bundle-lines";
import { assertRentalEligibility } from "@/app/lib/rentals/eligibility";
import { resolveRentalLineContext } from "@/app/lib/rentals/rental-context";
import {
  consumeLineStockInTx,
  getAvailableStockForLine,
  validateCombinedSharedStockDemand,
} from "@/app/lib/rentals/order-stock";
import { getStockPoolForTransaction } from "@/app/lib/rentals/stock";
import {
  buildRentalContentSectionsSnapshot,
  filterContentSectionsForMode,
} from "@/app/lib/rentals/validation";
import type { ProductTransactionType } from "@/app/lib/rentals/types";
import {
  getOrderItemDisplayName,
  getProductPriceAtPurchase,
  getRentalPriceAtPurchase,
} from "@/app/lib/orders/utils";
import { resolveUnitCost } from "@/app/lib/products/cost";
import {
  SUPPLIES_UNVERIFIED_CAUSE,
  SUPPLIES_VERIFIED_MESSAGE,
} from "@/app/lib/store/category";

/*
 * Order creation inside a caller's transaction. Server-only, not a server
 * action: these take a transaction plus an already-authorized user id, so the
 * checkout actions in app/lib/cart/actions.ts are the only way in.
 */

export type CreateOrderInTxResult = {
  orderId: number;
  mappedProducts: {
    id: number;
    name: string;
    quantity: number;
    price: number;
    status: "available" | "presale" | "sale";
    availableDate: Date | null;
    transactionType: ProductTransactionType;
    /** Contents of a bundle entry, one "2 × Producto (Talla: M)" per line. */
    components?: string[];
  }[];
  totalAmount: number;
};

export type { BundleOrderRequest };

type OrderTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type OrderLineInput = {
  productId: number;
  productVariantId: number | null;
  quantity: number;
  transactionType?: ProductTransactionType;
  rentalFestivalId?: number | null;
  rentalReservationId?: number | null;
};

type ResolvedOrderLine = {
  product: typeof products.$inferSelect;
  productVariantId: number | null;
  productVariantLabel: string | null;
  quantity: number;
  unitPrice: number;
  transactionType: ProductTransactionType;
  rentalFestivalId: number | null;
  rentalReservationId: number | null;
  rentalStockModeSnapshot: "shared" | "separate" | null;
  rentalContentSectionsSnapshot: ReturnType<
    typeof buildRentalContentSectionsSnapshot
  > | null;
};

function mergeOrderLines(lines: OrderLineInput[]): OrderLineInput[] {
  const merged = new Map<string, OrderLineInput>();

  for (const line of lines) {
    const transactionType = line.transactionType ?? "purchase";
    const key = `${line.productId}:${line.productVariantId ?? "base"}:${transactionType}`;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += line.quantity;
      continue;
    }
    merged.set(key, {
      productId: line.productId,
      productVariantId: line.productVariantId ?? null,
      quantity: line.quantity,
      transactionType,
      rentalFestivalId: line.rentalFestivalId ?? null,
      rentalReservationId: line.rentalReservationId ?? null,
    });
  }

  return Array.from(merged.values());
}

type ProductRow = typeof products.$inferSelect;
type VariantRow = typeof productVariants.$inferSelect;

type ResolvedOrder = {
  lines: ResolvedOrderLine[];
  bundles: ResolvedOrderBundle[];
  productMap: Map<number, ProductRow>;
  variantMap: Map<number, VariantRow>;
};

function sortedUnique(values: readonly number[]) {
  return [...new Set(values)].sort((a, b) => a - b);
}

async function resolveOrderLines(
  tx: OrderTx,
  lines: OrderLineInput[],
  bundleRequests: readonly BundleOrderRequest[] = [],
): Promise<ResolvedOrder> {
  if (lines.length === 0 && bundleRequests.length === 0) {
    throw new Error("No order items provided");
  }

  const normalizedLines = mergeOrderLines(lines);
  for (const line of normalizedLines) {
    if (line.quantity <= 0) {
      throw new Error(
        `Invalid quantity for product ${line.productId}/${line.productVariantId ?? "base"}`,
      );
    }
  }

  // Bundles first (share lock), then every product and variant row in id
  // order, so concurrent checkouts and adjustments cannot deadlock.
  const bundleRecords = await lockBundleRecordsForCheckout(tx, bundleRequests);
  const bundleTargets = bundleLockTargets(bundleRecords);
  const lineProductIds = sortedUnique(
    normalizedLines.map((line) => line.productId),
  );
  const productIds = sortedUnique([
    ...lineProductIds,
    ...bundleTargets.productIds,
  ]);
  const variantIds = sortedUnique([
    ...normalizedLines
      .map((line) => line.productVariantId)
      .filter((value): value is number => value != null),
    ...bundleTargets.variantIds,
  ]);

  const lockedProducts =
    productIds.length > 0
      ? await tx
          .select()
          .from(products)
          .where(inArray(products.id, productIds))
          .orderBy(asc(products.id))
          .for("update")
      : [];

  if (lockedProducts.length !== productIds.length) {
    const foundIds = new Set(lockedProducts.map((product) => product.id));
    const missingIds = productIds.filter((id) => !foundIds.has(id));
    throw new Error(`Products not found: ${missingIds.join(", ")}`);
  }

  const lockedVariants =
    variantIds.length > 0
      ? await tx
          .select()
          .from(productVariants)
          .where(inArray(productVariants.id, variantIds))
          .orderBy(asc(productVariants.id))
          .for("update")
      : [];

  const productsWithVariants = new Set(
    lineProductIds.length > 0
      ? (
          await tx
            .select({ productId: productVariants.productId })
            .from(productVariants)
            .where(inArray(productVariants.productId, lineProductIds))
        ).map((row) => row.productId)
      : [],
  );

  if (lockedVariants.length !== variantIds.length) {
    const foundIds = new Set(lockedVariants.map((variant) => variant.id));
    const missingIds = variantIds.filter((id) => !foundIds.has(id));
    throw new Error(`Variants not found: ${missingIds.join(", ")}`);
  }

  const variantSelections =
    variantIds.length > 0
      ? await tx.query.productVariantOptionValues.findMany({
          where: inArray(productVariantOptionValues.variantId, variantIds),
          with: {
            option: true,
            optionValue: true,
          },
        })
      : [];

  const productMap = new Map(
    lockedProducts.map((product) => [product.id, product]),
  );
  const variantMap = new Map(
    lockedVariants.map((variant) => [variant.id, variant]),
  );
  const selectionsByVariantId = new Map<number, typeof variantSelections>();

  for (const selection of variantSelections) {
    const entries = selectionsByVariantId.get(selection.variantId) ?? [];
    entries.push(selection);
    selectionsByVariantId.set(selection.variantId, entries);
  }

  // The rows are locked, so this read reflects exactly what will be sold.
  const resolvedBundles =
    bundleRecords.length > 0 || bundleRequests.length > 0
      ? resolveOrderBundles(
          bundleRequests,
          bundleRecords,
          await loadBundleCatalog(tx, bundleTargets.productIds),
        )
      : [];
  // Individual lines and bundle components compete for the same stock.
  const demandLines = [
    ...normalizedLines.map((entry) => ({
      productId: entry.productId,
      productVariantId: entry.productVariantId ?? null,
      quantity: entry.quantity,
      transactionType: entry.transactionType ?? "purchase",
    })),
    ...bundleDemandLines(resolvedBundles),
  ];

  const stockValidationErrors: string[] = [];
  const resolvedLines: ResolvedOrderLine[] = [];
  const contentSectionsByProductId = new Map<
    number,
    (typeof productContentSections)["$inferSelect"][]
  >();

  for (const productId of lineProductIds) {
    const sections = await tx.query.productContentSections.findMany({
      where: eq(productContentSections.productId, productId),
    });
    contentSectionsByProductId.set(productId, sections);
  }

  for (const line of normalizedLines) {
    const transactionType = line.transactionType ?? "purchase";
    const product = productMap.get(line.productId);
    if (!product) {
      throw new Error(`Product ${line.productId} not found`);
    }

    // A hidden product is off the storefront, so it is neither sold nor
    // rented, even to a cart or client that still names it.
    if (!product.isVisible) {
      throw new Error(`${product.name} ya no está disponible.`, {
        cause: "product_unavailable",
      });
    }

    if (transactionType === "purchase" && !product.isPurchasable) {
      throw new Error(`${product.name} no está disponible para compra.`, {
        cause: "product_unavailable",
      });
    }

    if (transactionType === "rental" && !product.isRentable) {
      throw new Error(`${product.name} no está disponible para alquiler.`, {
        cause: "product_unavailable",
      });
    }

    let variant = null;
    let productVariantLabel: string | null = null;
    let unitPrice =
      transactionType === "rental"
        ? getRentalPriceAtPurchase(product)
        : getProductPriceAtPurchase(product);

    if (line.productVariantId != null) {
      const matchedVariant = variantMap.get(line.productVariantId);
      if (!matchedVariant || matchedVariant.productId !== product.id) {
        throw new Error(
          `Variant ${line.productVariantId} does not belong to product ${product.id}`,
        );
      }

      if (!matchedVariant.isVisible) {
        throw new Error(`${product.name} - variante no disponible`, {
          cause: "variant_unavailable",
        });
      }

      variant = matchedVariant;
      productVariantLabel =
        getVariantLabel({
          selections: selectionsByVariantId.get(variant.id) ?? [],
        }) ?? null;
      unitPrice =
        transactionType === "rental"
          ? getRentalPriceAtPurchase(product)
          : getProductPriceAtPurchase(product, variant);
    } else if (productsWithVariants.has(product.id)) {
      throw new Error(`${product.name} - selecciona una variante`, {
        cause: "variant_required",
      });
    }

    const sharedRemaining = validateCombinedSharedStockDemand(
      demandLines,
      product,
      variant,
    );

    const usesSharedPool =
      getStockPoolForTransaction(product, transactionType) === "sale";
    const availableStock = usesSharedPool
      ? sharedRemaining
      : getAvailableStockForLine(product, variant, transactionType);

    const stockInsufficient = usesSharedPool
      ? availableStock < 0
      : line.quantity > availableStock;

    if (stockInsufficient) {
      const label = productVariantLabel
        ? `${product.name} (${productVariantLabel})`
        : product.name;
      stockValidationErrors.push(`${label} - stock insuficiente`);
    }

    const rentalSections =
      transactionType === "rental"
        ? filterContentSectionsForMode(
            contentSectionsByProductId.get(product.id) ?? [],
            "rental",
            line.productVariantId ?? null,
          )
        : [];

    resolvedLines.push({
      product,
      productVariantId: line.productVariantId ?? null,
      productVariantLabel,
      quantity: line.quantity,
      unitPrice,
      transactionType,
      rentalFestivalId:
        transactionType === "rental" ? (line.rentalFestivalId ?? null) : null,
      rentalReservationId:
        transactionType === "rental"
          ? (line.rentalReservationId ?? null)
          : null,
      rentalStockModeSnapshot:
        transactionType === "rental" ? product.rentalStockMode : null,
      rentalContentSectionsSnapshot:
        transactionType === "rental"
          ? buildRentalContentSectionsSnapshot(rentalSections)
          : null,
    });
  }

  stockValidationErrors.push(
    ...bundleComponentStockErrors(
      resolvedBundles,
      resolvedLines,
      demandLines,
      productMap,
      variantMap,
    ),
  );

  if (stockValidationErrors.length > 0) {
    throw new Error(`Stock insuficiente: ${stockValidationErrors.join(", ")}`, {
      cause: "stock_insufficient",
    });
  }

  return {
    lines: resolvedLines,
    bundles: resolvedBundles,
    productMap,
    variantMap,
  };
}

async function consumeOrderItemStock(
  tx: OrderTx,
  product: typeof products.$inferSelect,
  productVariantId: number | null,
  quantity: number,
  transactionType: ProductTransactionType,
  variantMap: Map<number, typeof productVariants.$inferSelect>,
  rentalStockModeSnapshot: "shared" | "separate" | null,
) {
  const variant =
    productVariantId != null
      ? (variantMap.get(productVariantId) ?? null)
      : null;
  await consumeLineStockInTx(
    tx,
    product,
    variant,
    quantity,
    transactionType,
    rentalStockModeSnapshot,
  );
}

async function consumeResolvedOrderLineStock(
  tx: OrderTx,
  line: ResolvedOrderLine,
  variantMap: Map<number, typeof productVariants.$inferSelect>,
) {
  await consumeOrderItemStock(
    tx,
    line.product,
    line.productVariantId,
    line.quantity,
    line.transactionType,
    variantMap,
    line.rentalStockModeSnapshot,
  );
}

/**
 * The order total: individual lines at their unit price plus each bundle's
 * exact paid amount in cents.
 */
function resolvedOrderTotal(resolved: ResolvedOrder) {
  const lineTotal = resolved.lines.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0,
  );
  const bundleCents = resolved.bundles.reduce(
    (sum, bundle) => sum + bundle.unitPriceCents * bundle.quantity,
    0,
  );
  return lineTotal + bundleCents / 100;
}

/**
 * Writes the order lines and deducts stock. Bundle components become regular
 * order lines priced at their allocated share of the bundle, linked to an
 * immutable bundle snapshot, so totals, adjustments, returns and reports all
 * use what was actually paid.
 */
async function persistResolvedOrderLines(
  tx: OrderTx,
  orderId: number,
  resolved: ResolvedOrder,
  options: { rentalContext: boolean },
) {
  const { variantMap, productMap } = resolved;
  for (const line of resolved.lines) {
    await tx.insert(orderItems).values({
      productId: line.product.id,
      productVariantId: line.productVariantId,
      productVariantLabel: line.productVariantLabel,
      quantity: line.quantity,
      priceAtPurchase: line.unitPrice,
      unitCostAtPurchase: resolveUnitCost(
        line.product.unitCost,
        line.productVariantId != null
          ? variantMap.get(line.productVariantId)?.unitCost
          : null,
      ),
      productNameAtPurchase: line.product.name,
      transactionType: line.transactionType,
      storeCategoryAtPurchase: line.product.storeCategory,
      ...(options.rentalContext
        ? {
            rentalContentSectionsSnapshot: line.rentalContentSectionsSnapshot,
            rentalStockModeSnapshot: line.rentalStockModeSnapshot,
            rentalFestivalId: line.rentalFestivalId,
            rentalReservationId: line.rentalReservationId,
          }
        : {}),
      orderId,
    });
  }

  for (const bundle of resolved.bundles) {
    const [orderBundle] = await tx
      .insert(orderBundles)
      .values({
        orderId,
        bundleId: bundle.bundleId,
        bundleVersion: bundle.bundleVersion,
        nameSnapshot: bundle.name,
        slugSnapshot: bundle.slug,
        imageUrlSnapshot: bundle.imageUrl,
        quantity: bundle.quantity,
        unitPriceCents: bundle.unitPriceCents,
        separateUnitPriceCents: bundle.separateUnitPriceCents,
        totalCents: bundle.unitPriceCents * bundle.quantity,
      })
      .returning({ id: orderBundles.id });
    for (const planned of planBundleOrderItems(bundle)) {
      const { component } = planned;
      const product = productMap.get(component.productId)!;
      const [orderItem] = await tx
        .insert(orderItems)
        .values({
          orderId,
          productId: component.productId,
          productVariantId: component.productVariantId,
          productVariantLabel: component.variantLabel,
          quantity: planned.unitsPerBundle * bundle.quantity,
          priceAtPurchase: planned.paidUnitCents / 100,
          unitCostAtPurchase: resolveUnitCost(
            product.unitCost,
            component.productVariantId != null
              ? variantMap.get(component.productVariantId)?.unitCost
              : null,
          ),
          productNameAtPurchase: product.name,
          transactionType: "purchase",
          storeCategoryAtPurchase: product.storeCategory,
        })
        .returning({ id: orderItems.id });
      await tx.insert(orderBundleItems).values({
        orderBundleId: orderBundle.id,
        orderId,
        orderItemId: orderItem.id,
        unitsPerBundle: planned.unitsPerBundle,
        listUnitPriceCents: planned.unitListCents,
        paidUnitPriceCents: planned.paidUnitCents,
      });
    }
  }

  for (const line of resolved.lines) {
    await consumeResolvedOrderLineStock(tx, line, variantMap);
  }
  // Any failing component rejects the whole order, bundle included.
  for (const bundle of resolved.bundles) {
    for (const component of bundle.components) {
      await consumeOrderItemStock(
        tx,
        productMap.get(component.productId)!,
        component.productVariantId,
        component.quantity * bundle.quantity,
        "purchase",
        variantMap,
        null,
      );
    }
  }
}

function mapResolvedOrderForEmail(resolved: ResolvedOrder) {
  return [
    ...resolved.lines.map((line) => ({
      id: line.product.id,
      name: getOrderItemDisplayName({
        product: line.product,
        productVariantLabel: line.productVariantLabel,
      }),
      quantity: line.quantity,
      price: line.unitPrice,
      status: line.product.status,
      availableDate: line.product.availableDate || null,
      transactionType: line.transactionType,
    })),
    ...resolved.bundles.map(describeOrderBundle),
  ];
}

export async function createOrderInTx(
  tx: OrderTx,
  lines: OrderLineInput[],
  userId: number,
  _customerEmail: string,
  _customerName: string,
  bundles: readonly BundleOrderRequest[] = [],
): Promise<CreateOrderInTxResult> {
  // Kept in the transaction API for callers that already have customer
  // snapshots; order ownership is derived from the persisted user profile.
  void _customerEmail;
  void _customerName;

  let orderLines = lines;
  const rentalLines = orderLines.filter(
    (line) => (line.transactionType ?? "purchase") === "rental",
  );
  if (rentalLines.length > 0) {
    const rentalContexts = new Set(
      rentalLines.map((line) => line.rentalFestivalId),
    );
    if (rentalContexts.size > 1) {
      throw new Error(
        "Todos los productos de alquiler deben usar el mismo festival.",
        { cause: "multiple_rental_contexts" },
      );
    }

    const [sampleRentalLine] = rentalLines;
    const eligibility = await assertRentalEligibility(
      userId,
      sampleRentalLine.rentalFestivalId ?? undefined,
      sampleRentalLine.rentalReservationId ?? undefined,
    );
    if (!eligibility.eligible) {
      throw new Error(eligibility.message, { cause: "rental_ineligible" });
    }

    orderLines = orderLines.map((line) => {
      if ((line.transactionType ?? "purchase") !== "rental") return line;
      const resolvedContext = resolveRentalLineContext(
        eligibility.contexts,
        line.rentalFestivalId,
        line.rentalReservationId,
      );
      if (!resolvedContext.ok) {
        throw new Error(resolvedContext.message, {
          cause: resolvedContext.cause,
        });
      }
      return {
        ...line,
        rentalFestivalId: resolvedContext.context.festivalId,
        rentalReservationId: resolvedContext.context.reservationId,
      };
    });
  }

  const resolved = await resolveOrderLines(tx, orderLines, bundles);
  const totalAmount = resolvedOrderTotal(resolved);

  const [order] = await tx
    .insert(orders)
    .values({
      userId,
      totalAmount,
      paymentDueDate: sql`now() + interval '2 days'`,
    })
    .returning();

  await tx.insert(orderEvents).values({
    orderId: order.id,
    type: "created",
    revision: order.revision,
    actorId: userId,
    payload: { legacy: false },
  });

  await persistResolvedOrderLines(tx, order.id, resolved, {
    rentalContext: true,
  });

  return {
    orderId: order.id,
    mappedProducts: mapResolvedOrderForEmail(resolved),
    totalAmount,
  };
}

export type CreateGuestOrderInTxResult = CreateOrderInTxResult & {
  guestOrderToken: string;
};

export async function createGuestOrderInTx(
  tx: OrderTx,
  lines: OrderLineInput[],
  guestName: string,
  guestEmail: string,
  guestPhone: string,
  bundles: readonly BundleOrderRequest[] = [],
): Promise<CreateGuestOrderInTxResult> {
  if (lines.some((line) => (line.transactionType ?? "purchase") === "rental")) {
    throw new Error(
      "Los productos de alquiler requieren una cuenta verificada.",
      {
        cause: "rental_ineligible",
      },
    );
  }

  const resolved = await resolveOrderLines(tx, lines, bundles);
  // Authoritative supplies gate: guests are never verified accounts. The
  // storefront check is only early feedback; direct callers land here.
  if (
    resolved.lines.some((line) => line.product.storeCategory === "supplies")
  ) {
    throw new Error(SUPPLIES_VERIFIED_MESSAGE, {
      cause: SUPPLIES_UNVERIFIED_CAUSE,
    });
  }
  const totalAmount = resolvedOrderTotal(resolved);

  // Generate a cryptographically random token for guest order tracking
  const { randomBytes } = await import("crypto");
  const guestOrderToken = randomBytes(32).toString("hex");

  const [order] = await tx
    .insert(orders)
    .values({
      userId: null,
      guestName,
      guestEmail,
      guestPhone,
      guestOrderToken,
      totalAmount,
      paymentDueDate: sql`now() + interval '2 days'`,
    })
    .returning();

  await tx.insert(orderEvents).values({
    orderId: order.id,
    type: "created",
    revision: order.revision,
    actorId: null,
    payload: { legacy: false, guest: true },
  });

  await persistResolvedOrderLines(tx, order.id, resolved, {
    rentalContext: false,
  });

  return {
    orderId: order.id,
    mappedProducts: mapResolvedOrderForEmail(resolved),
    totalAmount,
    guestOrderToken,
  };
}
