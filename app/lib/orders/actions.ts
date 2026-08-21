"use server";

import { cookies } from "next/headers";
import {
  orderEvents,
  orderAdjustmentItems,
  orderAdjustments,
  orderItems,
  orders,
  productContentSections,
  products,
  productVariantOptionValues,
  productVariants,
  users,
} from "@/db/schema";
import {
  OrderStatus,
  OrderWithRelations,
  type AdminOrderAdjustmentProduct,
} from "@/app/lib/orders/definitions";
import {
  ORDER_TAB_VALUES,
  type OrderTabValue,
} from "@/app/lib/orders/order-tabs";
import { db } from "@/db";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  inArray,
  isNull,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { sendEmail } from "@/app/vendors/resend";
import { fetchAdminUsers } from "@/app/api/users/actions";
import OrderConfirmationForAdminsEmailTemplate from "@/app/emails/order-confirmation-for-admins";
import OrderConfirmationForUsersEmailTemplate from "@/app/emails/order-confirmation-for-user";
import OrderPaymentConfirmationForUserEmailTemplate from "@/app/emails/order-payment-confirmation-for-user";
import OrderVoucherSubmittedForAdminsEmailTemplate from "@/app/emails/order-voucher-submitted-for-admins";
import { getVariantLabel } from "@/app/lib/products/variants";
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
import type { RentalOrderFilter } from "@/app/lib/rentals/order-filters";
import {
  getPostHogClient,
  POSTHOG_SHUTDOWN_TIMEOUT_MS,
} from "@/app/lib/posthog-server";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";
import {
  getOrderItemDisplayName,
  getProductPriceAtPurchase,
  getRentalPriceAtPurchase,
} from "@/app/lib/orders/utils";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import type { StoreOrdersQuery } from "@/app/lib/orders/query-schema";
import { DateTime } from "luxon";
import { STORE_TIMEZONE } from "@/app/lib/formatters";
import { applyOrderAdjustment } from "@/app/lib/orders/adjustments";
import { resolveUnitCost } from "@/app/lib/products/cost";
import { canTransitionOrderStatus } from "@/app/lib/orders/status-transitions";
import { restoreEffectiveOrderStockInTx } from "@/app/lib/orders/cancellation";
import { getEffectiveOrderLines } from "@/app/lib/orders/projection";
import {
  mapOrdersProfitabilityQuery,
  ordersProfitabilityQuery,
  type OrdersProfitability,
  type ProfitabilityQueryRow,
} from "@/app/lib/orders/profitability";

function revalidateStoreOrderViews() {
  revalidatePath("/dashboard/store");
  revalidatePath("/dashboard/store/orders");
  revalidatePath("/dashboard/store/payments");
  revalidatePath("/dashboard/store/analytics");
}

export async function sendOrderEmails(emailData: {
  orderId: number;
  customerEmail: string;
  customerName: string;
  products: {
    id: number;
    name: string;
    quantity: number;
    price: number;
    status: "available" | "presale" | "sale";
    availableDate: Date | null;
    transactionType?: ProductTransactionType;
  }[];
  total: number;
}) {
  // 1. Send to user
  const { orderId, customerEmail, customerName, products, total } = emailData;

  await sendEmail({
    to: [customerEmail],
    from: "Glitter Store <reservas@productoraglitter.com>",
    subject: `Tu orden #${orderId} ha sido recibida`,
    react: OrderConfirmationForUsersEmailTemplate({
      customerName,
      orderId: String(orderId),
      products,
      total,
    }) as React.ReactElement,
  });

  // 2. Fetch admins
  const admins = await fetchAdminUsers();
  const adminEmails = admins.map((a) => a.email).filter(Boolean);

  if (adminEmails.length > 0) {
    await sendEmail({
      to: adminEmails,
      from: "Glitter Store <store@productoraglitter.com>",
      replyTo: "soporte@productoraglitter.com",
      subject: `Nueva orden #${orderId} de ${customerName || "Cliente"}`,
      react: OrderConfirmationForAdminsEmailTemplate({
        customerName,
        orderId: String(orderId),
        products,
        total,
      }) as React.ReactElement,
    });
  }
}

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
  }[];
  totalAmount: number;
};

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

const orderRelations = {
  customer: {
    with: {
      profileSubcategories: {
        with: {
          subcategory: true,
        },
      },
    },
  },
  orderItems: {
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
  },
} as const;

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

async function resolveOrderLines(
  tx: OrderTx,
  lines: OrderLineInput[],
): Promise<ResolvedOrderLine[]> {
  if (lines.length === 0) {
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

  const productIds = Array.from(
    new Set(normalizedLines.map((line) => line.productId)),
  );
  const variantIds = Array.from(
    new Set(
      normalizedLines
        .map((line) => line.productVariantId)
        .filter((value): value is number => value != null),
    ),
  );

  const lockedProducts = await tx
    .select()
    .from(products)
    .where(inArray(products.id, productIds))
    .for("update");

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
          .for("update")
      : [];

  const productsWithVariants = new Set(
    (
      await tx
        .select({ productId: productVariants.productId })
        .from(productVariants)
        .where(inArray(productVariants.productId, productIds))
    ).map((row) => row.productId),
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

  const stockValidationErrors: string[] = [];
  const resolvedLines: ResolvedOrderLine[] = [];
  const contentSectionsByProductId = new Map<
    number,
    (typeof productContentSections)["$inferSelect"][]
  >();

  for (const productId of productIds) {
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

    if (transactionType === "purchase" && !product.isPurchasable) {
      throw new Error(`${product.name} no está disponible para compra.`);
    }

    if (transactionType === "rental" && !product.isRentable) {
      throw new Error(`${product.name} no está disponible para alquiler.`);
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
      normalizedLines.map((entry) => ({
        productId: entry.productId,
        productVariantId: entry.productVariantId ?? null,
        quantity: entry.quantity,
        transactionType: entry.transactionType ?? "purchase",
      })),
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

  if (stockValidationErrors.length > 0) {
    throw new Error(`Stock insuficiente: ${stockValidationErrors.join(", ")}`, {
      cause: "stock_insufficient",
    });
  }

  return resolvedLines;
}

async function consumeOrderItemStock(
  tx: OrderTx,
  product: typeof products.$inferSelect,
  productVariantId: number | null,
  quantity: number,
  transactionType: ProductTransactionType,
  variantMap: Map<number, typeof productVariants.$inferSelect>,
) {
  const variant =
    productVariantId != null
      ? (variantMap.get(productVariantId) ?? null)
      : null;
  await consumeLineStockInTx(tx, product, variant, quantity, transactionType);
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
  );
}

export async function createOrderInTx(
  tx: OrderTx,
  lines: OrderLineInput[],
  userId: number,
  _customerEmail: string,
  _customerName: string,
): Promise<CreateOrderInTxResult> {
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

  const resolvedLines = await resolveOrderLines(tx, orderLines);
  const totalAmount = resolvedLines.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0,
  );

  const variantIds = Array.from(
    new Set(
      resolvedLines
        .map((line) => line.productVariantId)
        .filter((value): value is number => value != null),
    ),
  );
  const lockedVariants =
    variantIds.length > 0
      ? await tx
          .select()
          .from(productVariants)
          .where(inArray(productVariants.id, variantIds))
      : [];
  const variantMap = new Map(
    lockedVariants.map((variant) => [variant.id, variant]),
  );

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

  for (const line of resolvedLines) {
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
      rentalContentSectionsSnapshot: line.rentalContentSectionsSnapshot,
      rentalStockModeSnapshot: line.rentalStockModeSnapshot,
      rentalFestivalId: line.rentalFestivalId,
      rentalReservationId: line.rentalReservationId,
      orderId: order.id,
    });
  }

  for (const line of resolvedLines) {
    await consumeResolvedOrderLineStock(tx, line, variantMap);
  }

  const mappedProducts = resolvedLines.map((line) => ({
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
  }));

  return {
    orderId: order.id,
    mappedProducts,
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
): Promise<CreateGuestOrderInTxResult> {
  if (lines.some((line) => (line.transactionType ?? "purchase") === "rental")) {
    throw new Error(
      "Los productos de alquiler requieren una cuenta verificada.",
      {
        cause: "rental_ineligible",
      },
    );
  }

  const resolvedLines = await resolveOrderLines(tx, lines);
  const totalAmount = resolvedLines.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0,
  );

  const variantIds = Array.from(
    new Set(
      resolvedLines
        .map((line) => line.productVariantId)
        .filter((value): value is number => value != null),
    ),
  );
  const lockedVariants =
    variantIds.length > 0
      ? await tx
          .select()
          .from(productVariants)
          .where(inArray(productVariants.id, variantIds))
      : [];
  const variantMap = new Map(
    lockedVariants.map((variant) => [variant.id, variant]),
  );

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

  for (const line of resolvedLines) {
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
      orderId: order.id,
    });
  }

  for (const line of resolvedLines) {
    await consumeResolvedOrderLineStock(tx, line, variantMap);
  }

  const mappedProducts = resolvedLines.map((line) => ({
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
  }));

  return {
    orderId: order.id,
    mappedProducts,
    totalAmount,
    guestOrderToken,
  };
}

export async function sendGuestOrderEmails(emailData: {
  orderId: number;
  guestOrderToken: string;
  customerEmail: string;
  customerName: string;
  products: {
    id: number;
    name: string;
    quantity: number;
    price: number;
    status: "available" | "presale" | "sale";
    availableDate: Date | null;
    transactionType?: ProductTransactionType;
  }[];
  total: number;
}) {
  const {
    orderId,
    guestOrderToken,
    customerEmail,
    customerName,
    products,
    total,
  } = emailData;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const trackingUrl = `${baseUrl}/orders/${orderId}?token=${guestOrderToken}`;

  await sendEmail({
    to: [customerEmail],
    from: "Glitter Store <reservas@productoraglitter.com>",
    subject: `Tu orden #${orderId} ha sido recibida`,
    react: OrderConfirmationForUsersEmailTemplate({
      customerName,
      orderId: String(orderId),
      products,
      total,
      trackingUrl,
    }) as React.ReactElement,
  });

  const admins = await fetchAdminUsers();
  const adminEmails = admins.map((a) => a.email).filter(Boolean);

  if (adminEmails.length > 0) {
    await sendEmail({
      to: adminEmails,
      from: "Glitter Store <store@productoraglitter.com>",
      replyTo: "soporte@productoraglitter.com",
      subject: `Nueva orden #${orderId} de ${customerName || "Cliente"} (invitado)`,
      react: OrderConfirmationForAdminsEmailTemplate({
        customerName,
        orderId: String(orderId),
        products,
        total,
      }) as React.ReactElement,
    });
  }
}

export async function createOrder(
  lines: OrderLineInput[],
  userId: number,
  customerEmail: string,
  customerName: string,
) {
  let result: CreateOrderInTxResult | null = null;

  try {
    result = await db.transaction((tx) =>
      createOrderInTx(tx, lines, userId, customerEmail, customerName),
    );

    try {
      await sendOrderEmails({
        orderId: result.orderId,
        customerEmail,
        customerName,
        products: result.mappedProducts,
        total: result.totalAmount,
      });
    } catch (emailError) {
      console.error("Failed to send order emails", emailError);
    }

    return {
      success: true,
      message: "Orden creada correctamente.",
      details: { orderId: result.orderId },
    };
  } catch (error) {
    console.error(error);
    if (error instanceof Error && error.cause === "stock_insufficient") {
      return {
        success: false,
        message: error.message,
        details: null,
      };
    }
    return {
      success: false,
      message: "No se pudo crear la orden.",
      details: null,
    };
  }
}

export async function fetchOrder(
  orderId: number,
): Promise<OrderWithRelations | null> {
  try {
    const order = await db.query.orders.findFirst({
      with: orderRelations,
      where: eq(orders.id, orderId),
    });

    if (!order) {
      return null;
    }

    return withEffectiveOrderItems(order);
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function fetchOrderActivity(orderId: number) {
  const currentUser = await getCurrentUserProfile();
  if (!currentUser || currentUser.role !== "admin") return [];

  return db.query.orderEvents.findMany({
    where: eq(orderEvents.orderId, orderId),
    orderBy: [desc(orderEvents.createdAt)],
    with: {
      actor: true,
      adjustment: { with: { items: true } },
    },
  });
}

/** Fetches a guest order by id + token. Returns null if not found or token mismatch. */
export async function fetchGuestOrder(
  orderId: number,
  token: string,
): Promise<OrderWithRelations | null> {
  try {
    const order = await db.query.orders.findFirst({
      with: orderRelations,
      where: and(eq(orders.id, orderId), eq(orders.guestOrderToken, token)),
    });

    return order ? withEffectiveOrderItems(order) : null;
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function withEffectiveOrderItems(order: OrderWithRelations) {
  const [projected] = await withEffectiveOrders([order]);
  return projected;
}

async function withEffectiveOrders(
  orderRows: readonly OrderWithRelations[],
): Promise<OrderWithRelations[]> {
  if (orderRows.length === 0) return [];
  const adjustments = await db.query.orderAdjustments.findMany({
    where: inArray(
      orderAdjustments.orderId,
      orderRows.map((order) => order.id),
    ),
    with: {
      items: {
        with: {
          product: { with: { images: true } },
          variant: {
            with: {
              selections: { with: { option: true, optionValue: true } },
            },
          },
        },
      },
    },
  });
  const adjustmentLinesByOrder = new Map<
    number,
    (typeof adjustments)[number]["items"]
  >();
  for (const adjustment of adjustments) {
    const current = adjustmentLinesByOrder.get(adjustment.orderId) ?? [];
    current.push(...adjustment.items);
    adjustmentLinesByOrder.set(adjustment.orderId, current);
  }

  return orderRows.map((order) => {
    const adjustmentLines = adjustmentLinesByOrder.get(order.id) ?? [];
    const baseById = new Map(order.orderItems.map((item) => [item.id, item]));
    const adjustmentById = new Map(
      adjustmentLines.map((line) => [line.id, line]),
    );
    const lines = getEffectiveOrderLines(
      order.orderItems.map((item) => ({
        id: item.id,
        productId: item.productId,
        productVariantId: item.productVariantId,
        productVariantLabel: item.productVariantLabel,
        productNameAtPurchase: item.productNameAtPurchase,
        productName: item.product.name,
        quantity: item.quantity,
        priceAtPurchase: item.priceAtPurchase,
        unitCostAtPurchase: item.unitCostAtPurchase,
        transactionType: item.transactionType,
      })),
      adjustmentLines,
    );
    return {
      ...order,
      orderItems: lines.map((line) => {
        if (line.baseOrderItemId != null) {
          return {
            ...baseById.get(line.baseOrderItemId)!,
            quantity: line.quantity,
            adjustmentItemId: null,
          };
        }
        const source = adjustmentById.get(line.adjustmentItemId!)!;
        return {
          id: -source.id,
          orderId: order.id,
          productId: line.productId,
          productVariantId: line.productVariantId,
          productVariantLabel: line.variantLabel,
          quantity: line.quantity,
          priceAtPurchase: line.unitPrice,
          unitCostAtPurchase: line.unitCost,
          productNameAtPurchase: line.productName,
          transactionType: line.transactionType,
          rentalContentSectionsSnapshot: null,
          rentalStockModeSnapshot: null,
          rentalFestivalId: null,
          rentalReservationId: null,
          rentalReturnedQuantity: 0,
          updatedAt: source.createdAt,
          createdAt: source.createdAt,
          product: source.product,
          variant: source.variant,
          adjustmentItemId: source.id,
        };
      }),
    };
  });
}

export async function fetchOrdersByUserId(userId: number) {
  try {
    const rows = await db.query.orders.findMany({
      where: eq(orders.userId, userId),
      orderBy: [desc(orders.createdAt)],
      with: orderRelations,
    });
    return withEffectiveOrders(rows);
  } catch (error) {
    console.error(error);
    return [];
  }
}

// ─── Order count aggregate ────────────────────────────────────────────────────

const ORDER_TAB_DEFAULT: Record<OrderTabValue, number> =
  ORDER_TAB_VALUES.reduce(
    (acc, value) => {
      acc[value] = 0;
      return acc;
    },
    {} as Record<OrderTabValue, number>,
  );

export async function fetchOrderCountsByUserId(
  userId: number,
): Promise<Record<OrderTabValue, number>> {
  try {
    const rows = await db
      .select({ status: orders.status, count: count() })
      .from(orders)
      .where(eq(orders.userId, userId))
      .groupBy(orders.status);

    const result = { ...ORDER_TAB_DEFAULT };
    for (const row of rows) {
      if (row.status in result) {
        result[row.status as OrderTabValue] = Number(row.count);
      }
    }
    return result;
  } catch (error) {
    console.error(error);
    return { ...ORDER_TAB_DEFAULT };
  }
}

export async function fetchOrdersByUserIdAndStatus(
  userId: number,
  status: OrderStatus,
) {
  try {
    const rows = await db.query.orders.findMany({
      where: and(eq(orders.userId, userId), eq(orders.status, status)),
      orderBy: [desc(orders.createdAt)],
      with: orderRelations,
    });
    return withEffectiveOrders(rows);
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function fetchOrders() {
  try {
    const rows = await db.query.orders.findMany({
      with: orderRelations,
    });
    return withEffectiveOrders(rows);
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function fetchOrdersByStatus(
  status?: OrderStatus | readonly OrderStatus[],
  rentalFilter: RentalOrderFilter = "all",
  filters?: Pick<StoreOrdersQuery, "period" | "from" | "to" | "q">,
) {
  try {
    const statusWhere =
      status === undefined
        ? undefined
        : typeof status === "string"
          ? eq(orders.status, status)
          : inArray(orders.status, status);

    const rentalWhere = buildRentalFilterSql(rentalFilter);
    const dateWhere = buildOrderDateFilterSql(filters);
    const searchWhere = buildOrderSearchSql(filters?.q);
    const whereClause = and(statusWhere, rentalWhere, dateWhere, searchWhere);

    const rows = await db.query.orders.findMany({
      where: whereClause,
      orderBy: [desc(orders.createdAt)],
      with: orderRelations,
    });
    return withEffectiveOrders(rows);
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function fetchOrdersForAdmin(query: StoreOrdersQuery) {
  const currentUser = await getCurrentUserProfile();
  if (!currentUser || currentUser.role !== "admin") return [];

  const status =
    query.status === "all"
      ? undefined
      : query.status === "needs_attention"
        ? (["pending", "payment_verification"] as const)
        : query.status;
  return fetchOrdersByStatus(status, query.rental, query);
}

function buildOrderDateFilterSql(
  filters: Pick<StoreOrdersQuery, "period" | "from" | "to"> | undefined,
) {
  if (!filters) return undefined;

  const now = DateTime.now().setZone(STORE_TIMEZONE);
  const from = filters.from
    ? DateTime.fromISO(filters.from, { zone: STORE_TIMEZONE }).startOf("day")
    : filters.period === "today"
      ? now.startOf("day")
      : filters.period === "week"
        ? now.startOf("week")
        : filters.period === "month"
          ? now.startOf("month")
          : null;
  const to = filters.to
    ? DateTime.fromISO(filters.to, { zone: STORE_TIMEZONE }).endOf("day")
    : null;

  return and(
    from?.isValid ? sql`${orders.createdAt} >= ${from.toJSDate()}` : undefined,
    to?.isValid ? sql`${orders.createdAt} <= ${to.toJSDate()}` : undefined,
  );
}

function buildOrderSearchSql(query: string | undefined) {
  const normalized = query?.trim();
  if (!normalized) return undefined;

  const pattern = `%${normalized}%`;
  return or(
    sql`cast(${orders.id} as text) ilike ${pattern}`,
    sql`${orders.guestName} ilike ${pattern}`,
    sql`${orders.guestEmail} ilike ${pattern}`,
    sql`${orders.guestPhone} ilike ${pattern}`,
    exists(
      db
        .select({ one: sql`1` })
        .from(users)
        .where(
          and(
            eq(users.id, orders.userId),
            or(
              sql`${users.displayName} ilike ${pattern}`,
              sql`${users.email} ilike ${pattern}`,
              sql`${users.phoneNumber} ilike ${pattern}`,
            ),
          ),
        ),
    ),
    exists(
      db
        .select({ one: sql`1` })
        .from(orderItems)
        .innerJoin(products, eq(orderItems.productId, products.id))
        .where(
          and(
            eq(orderItems.orderId, orders.id),
            or(
              sql`${products.name} ilike ${pattern}`,
              sql`${orderItems.productNameAtPurchase} ilike ${pattern}`,
              sql`${orderItems.productVariantLabel} ilike ${pattern}`,
            ),
          ),
        ),
    ),
    exists(
      db
        .select({ one: sql`1` })
        .from(orderAdjustmentItems)
        .innerJoin(
          orderAdjustments,
          eq(orderAdjustmentItems.adjustmentId, orderAdjustments.id),
        )
        .where(
          and(
            eq(orderAdjustments.orderId, orders.id),
            or(
              sql`${orderAdjustmentItems.productNameSnapshot} ilike ${pattern}`,
              sql`${orderAdjustmentItems.variantLabelSnapshot} ilike ${pattern}`,
            ),
          ),
        ),
    ),
  );
}

function buildRentalFilterSql(filter: RentalOrderFilter) {
  if (filter === "all") return undefined;

  if (filter === "has_rental") {
    return exists(
      db
        .select({ one: sql`1` })
        .from(orderItems)
        .where(
          and(
            eq(orderItems.orderId, orders.id),
            eq(orderItems.transactionType, "rental"),
          ),
        ),
    );
  }

  const rentalItemScope = and(
    eq(orderItems.orderId, orders.id),
    eq(orderItems.transactionType, "rental"),
  );

  if (filter === "out") {
    return and(
      exists(
        db
          .select({ one: sql`1` })
          .from(orderItems)
          .where(rentalItemScope),
      ),
      notExists(
        db
          .select({ one: sql`1` })
          .from(orderItems)
          .where(
            and(rentalItemScope, sql`${orderItems.rentalReturnedQuantity} > 0`),
          ),
      ),
    );
  }

  if (filter === "partially_returned") {
    return and(
      exists(
        db
          .select({ one: sql`1` })
          .from(orderItems)
          .where(
            and(rentalItemScope, sql`${orderItems.rentalReturnedQuantity} > 0`),
          ),
      ),
      exists(
        db
          .select({ one: sql`1` })
          .from(orderItems)
          .where(
            and(
              rentalItemScope,
              sql`${orderItems.rentalReturnedQuantity} < ${orderItems.quantity}`,
            ),
          ),
      ),
    );
  }

  return and(
    exists(
      db
        .select({ one: sql`1` })
        .from(orderItems)
        .where(rentalItemScope),
    ),
    notExists(
      db
        .select({ one: sql`1` })
        .from(orderItems)
        .where(
          and(
            rentalItemScope,
            sql`${orderItems.rentalReturnedQuantity} < ${orderItems.quantity}`,
          ),
        ),
    ),
  );
}

export async function fetchPendingVoucherCount(): Promise<number> {
  try {
    const result = await db
      .select({ count: count() })
      .from(orders)
      .where(eq(orders.status, "payment_verification"));
    return result[0]?.count ?? 0;
  } catch (error) {
    console.error(error);
    return 0;
  }
}

export async function fetchPendingVoucherReviewOrders() {
  try {
    const rows = await db.query.orders.findMany({
      where: eq(orders.status, "payment_verification"),
      orderBy: [desc(orders.voucherSubmittedAt)],
      with: orderRelations,
    });
    return withEffectiveOrders(rows);
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function acceptOrder(orderId: number, expectedRevision: number) {
  return updateOrderStatus(orderId, "paid", expectedRevision);
}

export async function deleteOrder(_orderId: number) {
  return {
    success: false,
    message: "Los pedidos conservan un historial permanente y no se eliminan.",
  };
}

export async function updateOrderStatus(
  orderId: number,
  status: OrderStatus,
  expectedRevision: number,
) {
  const currentUser = await getCurrentUserProfile();
  if (!currentUser || currentUser.role !== "admin") {
    return {
      success: false,
      message: "No tienes permisos para actualizar pedidos.",
    };
  }
  if (!Number.isInteger(orderId) || !Number.isInteger(expectedRevision)) {
    return { success: false, message: "Solicitud inválida." };
  }

  let previousStatus: OrderStatus | null = null;

  try {
    await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .for("update");
      if (!order)
        throw new Error("Pedido no encontrado.", { cause: "not_found" });
      if (order.revision !== expectedRevision) {
        throw new Error("El pedido cambió en otra sesión. Recargá la página.", {
          cause: "conflict",
        });
      }
      if (!canTransitionOrderStatus(order.status, status)) {
        throw new Error("La transición de estado no está permitida.", {
          cause: "invalid_transition",
        });
      }
      previousStatus = order.status;

      if (status === "cancelled") {
        await restoreEffectiveOrderStockInTx(tx, orderId);
      }

      const revision = order.revision + 1;
      await tx
        .update(orders)
        .set({ status, revision, updatedAt: sql`now()` })
        .where(eq(orders.id, orderId));
      await tx.insert(orderEvents).values({
        orderId,
        type: status === "cancelled" ? "cancelled" : "status_changed",
        revision,
        actorId: currentUser.id,
        payload: { previousStatus: order.status, status },
      });
    });
  } catch (error) {
    console.error(error);
    const safeCause =
      error instanceof Error &&
      ["not_found", "conflict", "invalid_transition"].includes(
        String(error.cause),
      );
    return {
      success: false,
      message: safeCause ? error.message : "No se pudo actualizar el pedido.",
    };
  }

  const orderAfter = await fetchOrder(orderId);
  if (status === "paid" && previousStatus !== "paid" && orderAfter) {
    const recipientEmail = orderAfter.customer?.email ?? orderAfter.guestEmail;
    const recipientName =
      orderAfter.customer?.displayName ??
      orderAfter.customer?.firstName ??
      orderAfter.guestName ??
      "";
    try {
      if (recipientEmail) {
        await sendEmail({
          to: [recipientEmail],
          from: "Glitter Store <reservas@productoraglitter.com>",
          subject: `Tu pago de la orden #${orderId} fue confirmado`,
          react: OrderPaymentConfirmationForUserEmailTemplate({
            customerName: recipientName,
            orderId: String(orderId),
            total: orderAfter.totalAmount,
          }) as React.ReactElement,
        });
      }
    } catch (emailError) {
      console.error("Failed to send payment confirmation email", emailError);
    }
  }

  revalidateStoreOrderViews();
  return {
    success: true,
    message: "Pedido actualizado correctamente.",
  };
}

function isAllowedVoucherUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase();
    return (
      hostname === "utfs.io" ||
      hostname === "ufs.sh" ||
      hostname.endsWith(".ufs.sh")
    );
  } catch {
    console.error("URL de comprobante de pago inválida");
    return false;
  }
}

export async function submitOrderPaymentVoucher(
  orderId: number,
  voucherUrl: string,
  expectedRevision: number,
) {
  const currentUser = await getCurrentUserProfile();
  if (!currentUser) {
    return {
      success: false,
      message: "Debes iniciar sesión para enviar el comprobante.",
    };
  }

  if (
    !Number.isInteger(orderId) ||
    !Number.isInteger(expectedRevision) ||
    expectedRevision < 1 ||
    !isAllowedVoucherUrl(voucherUrl)
  ) {
    return {
      success: false,
      message: "Solicitud inválida.",
    };
  }

  try {
    const order = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, orderId),
            eq(orders.userId, currentUser.id),
            eq(orders.status, "pending"),
          ),
        )
        .for("update");
      if (!locked) return null;
      if (locked.revision !== expectedRevision) {
        throw new Error("El pedido cambió en otra sesión. Recargá la página.", {
          cause: "conflict",
        });
      }
      const revision = locked.revision + 1;
      const [updated] = await tx
        .update(orders)
        .set({
          paymentVoucherUrl: voucherUrl,
          status: "payment_verification",
          voucherSubmittedAt: new Date(),
          revision,
          updatedAt: sql`now()`,
        })
        .where(eq(orders.id, orderId))
        .returning();
      await tx.insert(orderEvents).values({
        orderId,
        type: "status_changed",
        revision,
        actorId: currentUser.id,
        payload: {
          previousStatus: locked.status,
          status: "payment_verification",
          voucherSubmitted: true,
        },
      });
      return updated;
    });

    if (!order) {
      return {
        success: false,
        message: "Orden no encontrada o no tienes permiso para actualizarla.",
      };
    }

    if (order.userId) {
      revalidatePath(`/profiles/${order.userId}/orders/${orderId}`);
    }
    revalidateStoreOrderViews();

    try {
      const admins = await fetchAdminUsers();
      const adminEmails = admins.map((a) => a.email).filter(Boolean);
      if (adminEmails.length > 0) {
        await sendEmail({
          to: adminEmails,
          from: "Glitter Store <store@productoraglitter.com>",
          subject: `Nuevo comprobante de pago — orden #${orderId}`,
          react: OrderVoucherSubmittedForAdminsEmailTemplate({
            customerName:
              currentUser.displayName ?? currentUser.firstName ?? "Cliente",
            orderId: String(orderId),
          }) as React.ReactElement,
        });
      }
    } catch (adminEmailError) {
      console.error("[submitOrderVoucher] Admin notification email failed", {
        orderId,
        error: adminEmailError,
      });
    }

    try {
      const posthog = getPostHogClient();
      posthog.capture({
        distinctId: currentUser.clerkId,
        event: POSTHOG_EVENTS.ORDER_PAYMENT_VOUCHER_UPLOADED,
        properties: { order_id: orderId },
      });
      await posthog.shutdown(POSTHOG_SHUTDOWN_TIMEOUT_MS);
    } catch (posthogError) {
      console.error("[submitOrderPaymentVoucher] PostHog capture failed", {
        orderId,
        error: posthogError,
      });
    }

    return { success: true, message: "Comprobante enviado correctamente." };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message:
        error instanceof Error && error.cause === "conflict"
          ? error.message
          : "No se pudo enviar el comprobante.",
    };
  }
}

export async function submitGuestOrderPaymentVoucher(
  orderId: number,
  token: string,
  voucherUrl: string,
  expectedRevision: number,
) {
  if (
    !Number.isInteger(orderId) ||
    !Number.isInteger(expectedRevision) ||
    expectedRevision < 1 ||
    !isAllowedVoucherUrl(voucherUrl)
  ) {
    return { success: false, message: "Solicitud inválida." };
  }

  try {
    const order = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, orderId),
            eq(orders.guestOrderToken, token),
            isNull(orders.userId),
            eq(orders.status, "pending"),
          ),
        )
        .for("update");
      if (!locked) return null;
      if (locked.revision !== expectedRevision) {
        throw new Error("El pedido cambió en otra sesión. Recargá la página.", {
          cause: "conflict",
        });
      }
      const revision = locked.revision + 1;
      const [updated] = await tx
        .update(orders)
        .set({
          paymentVoucherUrl: voucherUrl,
          status: "payment_verification",
          voucherSubmittedAt: new Date(),
          revision,
          updatedAt: sql`now()`,
        })
        .where(eq(orders.id, orderId))
        .returning();
      await tx.insert(orderEvents).values({
        orderId,
        type: "status_changed",
        revision,
        actorId: null,
        payload: {
          previousStatus: locked.status,
          status: "payment_verification",
          voucherSubmitted: true,
          guest: true,
        },
      });
      return updated;
    });

    if (!order) {
      return {
        success: false,
        message: "Orden no encontrada o el token no es válido.",
      };
    }

    revalidatePath(`/orders/${orderId}`);
    revalidateStoreOrderViews();

    try {
      const admins = await fetchAdminUsers();
      const adminEmails = admins.map((a) => a.email).filter(Boolean);
      if (adminEmails.length > 0) {
        await sendEmail({
          to: adminEmails,
          from: "Glitter Store <store@productoraglitter.com>",
          subject: `Nuevo comprobante de pago — orden #${orderId}`,
          react: OrderVoucherSubmittedForAdminsEmailTemplate({
            customerName: order.guestName ?? "Invitado",
            orderId: String(orderId),
          }) as React.ReactElement,
        });
      }
    } catch (adminEmailError) {
      console.error(
        "[submitGuestOrderPaymentVoucher] Admin notification email failed",
        { orderId, error: adminEmailError },
      );
    }

    try {
      const posthog = getPostHogClient();
      posthog.capture({
        distinctId: `guest_order_${orderId}`,
        event: POSTHOG_EVENTS.ORDER_PAYMENT_VOUCHER_UPLOADED,
        properties: { order_id: orderId, is_guest: true },
      });
      await posthog.shutdown(POSTHOG_SHUTDOWN_TIMEOUT_MS);
    } catch (posthogError) {
      console.error("[submitGuestOrderPaymentVoucher] PostHog capture failed", {
        orderId,
        error: posthogError,
      });
    }

    return { success: true, message: "Comprobante enviado correctamente." };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message:
        error instanceof Error && error.cause === "conflict"
          ? error.message
          : "No se pudo enviar el comprobante.",
    };
  }
}

export async function adminAttachOrderVoucher(
  orderId: number,
  voucherUrl: string,
  expectedRevision: number,
) {
  const currentUser = await getCurrentUserProfile();
  if (!currentUser || currentUser.role !== "admin") {
    return {
      success: false,
      message: "No tienes permisos para realizar esta acción.",
    };
  }
  if (
    !Number.isInteger(orderId) ||
    !Number.isInteger(expectedRevision) ||
    expectedRevision < 1 ||
    !isAllowedVoucherUrl(voucherUrl)
  ) {
    return { success: false, message: "Solicitud inválida." };
  }

  try {
    await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .for("update");
      if (
        !order ||
        !["pending", "payment_verification"].includes(order.status)
      ) {
        throw new Error("Orden no encontrada o ya procesada.", {
          cause: "not_found",
        });
      }
      if (order.revision !== expectedRevision) {
        throw new Error("El pedido cambió en otra sesión. Recargá la página.", {
          cause: "conflict",
        });
      }
      const revision = order.revision + 1;
      await tx
        .update(orders)
        .set({
          paymentVoucherUrl: voucherUrl,
          voucherSubmittedAt: new Date(),
          status: "payment_verification",
          revision,
          updatedAt: sql`now()`,
        })
        .where(eq(orders.id, orderId));
      await tx.insert(orderEvents).values({
        orderId,
        type: "status_changed",
        revision,
        actorId: currentUser.id,
        payload: {
          previousStatus: order.status,
          status: "payment_verification",
          voucherAttached: true,
        },
      });
    });
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message:
        error instanceof Error &&
        (error.cause === "conflict" || error.cause === "not_found")
          ? error.message
          : "No se pudo guardar el comprobante.",
    };
  }

  revalidateStoreOrderViews();
  return { success: true, message: "Comprobante guardado correctamente." };
}

export type OrdersStats = {
  totalOrders: number;
  totalRevenue: number;
  needsAttention: number;
  inProgress: number;
  delivered: number;
  cancelled: number;
};

export type { OrdersProfitability } from "@/app/lib/orders/profitability";

export type HistoricalCostBackfillPreview = {
  missingLines: number;
  resolvableLines: number;
  unresolvedLines: number;
  affectedOrders: number;
  estimatedCost: number;
};

export async function fetchHistoricalCostBackfillPreview(): Promise<HistoricalCostBackfillPreview> {
  const currentUser = await getCurrentUserProfile();
  if (!currentUser || currentUser.role !== "admin") {
    return {
      missingLines: 0,
      resolvableLines: 0,
      unresolvedLines: 0,
      affectedOrders: 0,
      estimatedCost: 0,
    };
  }

  const [preview] = await db
    .select({
      missingLines: sql<number>`cast(count(*) as integer)`,
      resolvableLines: sql<number>`cast(count(*) filter (where coalesce(${productVariants.unitCost}, ${products.unitCost}) is not null) as integer)`,
      unresolvedLines: sql<number>`cast(count(*) filter (where coalesce(${productVariants.unitCost}, ${products.unitCost}) is null) as integer)`,
      affectedOrders: sql<number>`cast(count(distinct ${orderItems.orderId}) filter (where coalesce(${productVariants.unitCost}, ${products.unitCost}) is not null) as integer)`,
      estimatedCost: sql<number>`cast(coalesce(sum(coalesce(${productVariants.unitCost}, ${products.unitCost}) * ${orderItems.quantity}), 0) as numeric(12,2))`,
    })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .leftJoin(
      productVariants,
      and(
        eq(orderItems.productVariantId, productVariants.id),
        eq(orderItems.productId, productVariants.productId),
      ),
    )
    .where(
      and(
        eq(orderItems.transactionType, "purchase"),
        isNull(orderItems.unitCostAtPurchase),
      ),
    );

  return {
    missingLines: preview?.missingLines ?? 0,
    resolvableLines: preview?.resolvableLines ?? 0,
    unresolvedLines: preview?.unresolvedLines ?? 0,
    affectedOrders: preview?.affectedOrders ?? 0,
    estimatedCost: Number(preview?.estimatedCost ?? 0),
  };
}

export async function applyHistoricalOrderCosts(): Promise<{
  success: boolean;
  message: string;
  updatedLines?: number;
  affectedOrders?: number;
}> {
  const currentUser = await getCurrentUserProfile();
  if (!currentUser || currentUser.role !== "admin") {
    return {
      success: false,
      message: "No tienes permisos para completar costos históricos.",
    };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const candidates = await tx.execute(sql`
        select distinct oi.order_id
        from order_items oi
        inner join products p on p.id = oi.product_id
        left join product_variants pv
          on pv.id = oi.product_variant_id
          and pv.product_id = oi.product_id
        where oi.unit_cost_at_purchase is null
          and oi.transaction_type = 'purchase'
          and coalesce(pv.unit_cost, p.unit_cost) is not null
        order by oi.order_id
      `);
      const orderIds = candidates.rows.map((row) => Number(row.order_id));
      const lockedOrders =
        orderIds.length === 0
          ? []
          : await tx
              .select()
              .from(orders)
              .where(inArray(orders.id, orderIds))
              .orderBy(orders.id)
              .for("update");

      const updated = await tx.execute(sql`
      with candidates as (
        select
          oi.id,
          coalesce(pv.unit_cost, p.unit_cost) as historical_cost,
          p.name as product_name
        from order_items oi
        inner join products p on p.id = oi.product_id
        left join product_variants pv
          on pv.id = oi.product_variant_id
          and pv.product_id = oi.product_id
        where oi.unit_cost_at_purchase is null
          and oi.transaction_type = 'purchase'
      )
      update order_items oi
      set
        unit_cost_at_purchase = candidates.historical_cost,
        product_name_at_purchase = coalesce(
          oi.product_name_at_purchase,
          candidates.product_name
        ),
        updated_at = now()
      from candidates
      where oi.id = candidates.id
        and candidates.historical_cost is not null
        and oi.unit_cost_at_purchase is null
      returning oi.id, oi.order_id
      `);
      const lineCountByOrder = new Map<number, number>();
      for (const row of updated.rows) {
        const orderId = Number(row.order_id);
        lineCountByOrder.set(orderId, (lineCountByOrder.get(orderId) ?? 0) + 1);
      }
      for (const order of lockedOrders) {
        const updatedLines = lineCountByOrder.get(order.id) ?? 0;
        if (updatedLines === 0) continue;
        const revision = order.revision + 1;
        await tx
          .update(orders)
          .set({ revision, updatedAt: sql`now()` })
          .where(eq(orders.id, order.id));
        await tx.insert(orderEvents).values({
          orderId: order.id,
          type: "items_changed",
          revision,
          actorId: currentUser.id,
          payload: { historicalCostEstimate: true, updatedLines },
        });
      }
      return updated;
    });
    const affectedOrders = new Set(
      result.rows.map((row) => Number(row.order_id)),
    ).size;

    revalidateStoreOrderViews();
    return {
      success: true,
      message:
        result.rows.length === 0
          ? "No hay costos históricos pendientes que se puedan completar."
          : `Se completaron ${result.rows.length} líneas en ${affectedOrders} pedidos.`,
      updatedLines: result.rows.length,
      affectedOrders,
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "No se pudieron completar los costos históricos.",
    };
  }
}

export async function fetchOrdersProfitability(): Promise<OrdersProfitability> {
  try {
    const result = await db.execute<ProfitabilityQueryRow>(
      ordersProfitabilityQuery,
    );
    return mapOrdersProfitabilityQuery(result.rows);
  } catch (error) {
    console.error(error);
    return {
      grossRevenue: 0,
      productCost: 0,
      grossProfit: 0,
      knownCostRevenue: 0,
      lineCount: 0,
      rows: [],
    };
  }
}

export async function fetchOrdersStats(): Promise<OrdersStats> {
  try {
    const [result] = await db
      .select({
        totalOrders: sql<number>`cast(count(*) as integer)`,
        totalRevenue: sql<number>`cast(coalesce(sum(${orders.totalAmount}) filter (where ${orders.status} in ('paid', 'delivered')), 0) as numeric(10,2))`,
        needsAttention: sql<number>`cast(count(*) filter (where ${orders.status} in ('pending', 'payment_verification')) as integer)`,
        inProgress: sql<number>`cast(count(*) filter (where ${orders.status} = 'processing') as integer)`,
        delivered: sql<number>`cast(count(*) filter (where ${orders.status} = 'delivered') as integer)`,
        cancelled: sql<number>`cast(count(*) filter (where ${orders.status} = 'cancelled') as integer)`,
      })
      .from(orders);

    return {
      totalOrders: result.totalOrders ?? 0,
      totalRevenue: Number(result.totalRevenue ?? 0),
      needsAttention: result.needsAttention ?? 0,
      inProgress: result.inProgress ?? 0,
      delivered: result.delivered ?? 0,
      cancelled: result.cancelled ?? 0,
    };
  } catch (error) {
    console.error(error);
    return {
      totalOrders: 0,
      totalRevenue: 0,
      needsAttention: 0,
      inProgress: 0,
      delivered: 0,
      cancelled: 0,
    };
  }
}

export type UpdateOrderItemInput = {
  orderItemId: number;
  quantity: number; // 0 = remove
};

export type UpdateOrderResult = {
  success: boolean;
  message: string;
  wasCancelled?: boolean;
  cause?: "conflict" | "stock_insufficient" | "not_found" | "forbidden";
};

export async function updateOrder(
  orderId: number,
  profileId: number,
  items: UpdateOrderItemInput[],
  clientUpdatedAt: string,
): Promise<UpdateOrderResult> {
  const currentUser = await getCurrentUserProfile();
  const order = await fetchOrder(orderId);
  if (!currentUser || !order || order.userId !== currentUser.id) {
    return {
      success: false,
      cause: "forbidden",
      message: "No tienes permiso para editar este pedido.",
    };
  }
  if (order.status !== "pending") {
    return {
      success: false,
      message: "Solo puedes editar pedidos pendientes.",
    };
  }
  if (order.updatedAt.toISOString() !== clientUpdatedAt) {
    return {
      success: false,
      cause: "conflict",
      message:
        "El pedido fue modificado en otra sesión. Por favor recargá la página.",
    };
  }

  const requested = new Map(
    items.map((item) => [item.orderItemId, item.quantity]),
  );
  if (
    items.some(
      (item) => !Number.isInteger(item.quantity) || item.quantity < 0,
    ) ||
    [...requested].some(
      ([id]) => !order.orderItems.some((item) => item.id === id),
    )
  ) {
    return {
      success: false,
      cause: "forbidden",
      message: "El ajuste contiene artículos inválidos.",
    };
  }
  const changedItems = order.orderItems
    .map((item) => ({
      item,
      quantityDelta: (requested.get(item.id) ?? item.quantity) - item.quantity,
    }))
    .filter(({ quantityDelta }) => quantityDelta !== 0);
  try {
    await applyOrderAdjustment({
      orderId,
      actorUserId: currentUser.id,
      actorRole: "customer",
      expectedRevision: order.revision,
      reason: "Ajuste solicitado por cliente",
      allowedStatuses: ["pending"],
      items: changedItems
        .filter(({ item }) => item.adjustmentItemId == null)
        .map(({ item, quantityDelta }) => ({
          baseOrderItemId: item.id,
          quantityDelta,
        })),
      addedItems: changedItems
        .filter(({ item }) => item.adjustmentItemId != null)
        .map(({ item, quantityDelta }) => ({
          adjustmentItemId: item.adjustmentItemId!,
          quantityDelta,
        })),
    });
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    return {
      success: false,
      cause:
        cause === "conflict" ||
        cause === "stock_insufficient" ||
        cause === "not_found" ||
        cause === "forbidden"
          ? cause
          : undefined,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo actualizar el pedido.",
    };
  }
  revalidatePath(`/profiles/${profileId}/orders/${orderId}`);
  revalidatePath(`/profiles/${profileId}/orders/${orderId}/edit`);
  revalidatePath("/my_orders");
  revalidateStoreOrderViews();
  return { success: true, message: "Tu pedido fue actualizado correctamente." };
}

const adminAdjustOrderSchema = z.object({
  orderId: z.number().int().positive(),
  items: z
    .array(
      z.object({
        orderItemId: z.number().int(),
        quantity: z.number().int().nonnegative(),
      }),
    )
    .max(200),
  additions: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        productVariantId: z.number().int().positive().nullable(),
        quantity: z.number().int().positive(),
      }),
    )
    .max(100),
  expectedRevision: z.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
  customerNote: z.string().trim().max(1000).optional(),
});

export type AdminAdjustOrderInput = z.infer<typeof adminAdjustOrderSchema>;

export async function fetchAdminOrderAdjustmentProducts(): Promise<
  AdminOrderAdjustmentProduct[]
> {
  const currentUser = await getCurrentUserProfile();
  if (!currentUser || currentUser.role !== "admin") return [];

  const rows = await db.query.products.findMany({
    where: eq(products.isPurchasable, true),
    orderBy: [asc(products.name)],
    with: {
      variants: {
        with: {
          selections: { with: { option: true, optionValue: true } },
        },
      },
    },
  });
  return rows.map((product) => ({
    id: product.id,
    name: product.name,
    price: getProductPriceAtPurchase(product),
    stock: product.stock ?? 0,
    requiresVariant: product.variants.length > 0,
    variants: product.variants
      .filter((variant) => variant.isVisible)
      .map((variant) => ({
        id: variant.id,
        label: getVariantLabel(variant) ?? `Variante #${variant.id}`,
        price: getProductPriceAtPurchase(product, variant),
        stock: variant.stock,
      })),
  }));
}

export async function adminAdjustOrder(rawInput: AdminAdjustOrderInput) {
  const currentUser = await getCurrentUserProfile();
  if (!currentUser || currentUser.role !== "admin") {
    return {
      success: false,
      message: "No tienes permisos para ajustar este pedido.",
    };
  }
  const parsed = adminAdjustOrderSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, message: "El ajuste contiene datos inválidos." };
  }
  const input = parsed.data;
  const order = await fetchOrder(input.orderId);
  if (!order) return { success: false, message: "Pedido no encontrado." };
  if (order.revision !== input.expectedRevision) {
    return {
      success: false,
      cause: "conflict",
      message: "El pedido cambió en otra sesión. Recargá la página.",
    };
  }

  const requested = new Map(
    input.items.map((item) => [item.orderItemId, item.quantity]),
  );
  if (
    [...requested].some(
      ([id]) => !order.orderItems.some((item) => item.id === id),
    )
  ) {
    return {
      success: false,
      message: "El ajuste contiene artículos inválidos.",
    };
  }
  const changedItems = order.orderItems
    .map((item) => ({
      item,
      quantityDelta: (requested.get(item.id) ?? item.quantity) - item.quantity,
    }))
    .filter(({ quantityDelta }) => quantityDelta !== 0);
  try {
    await applyOrderAdjustment({
      orderId: input.orderId,
      actorUserId: currentUser.id,
      actorRole: "admin",
      expectedRevision: input.expectedRevision,
      reason: input.reason,
      customerNote: input.customerNote,
      allowedStatuses: ["pending", "payment_verification", "processing"],
      items: changedItems
        .filter(({ item }) => item.adjustmentItemId == null)
        .map(({ item, quantityDelta }) => ({
          baseOrderItemId: item.id,
          quantityDelta,
        })),
      addedItems: changedItems
        .filter(({ item }) => item.adjustmentItemId != null)
        .map(({ item, quantityDelta }) => ({
          adjustmentItemId: item.adjustmentItemId!,
          quantityDelta,
        })),
      additions: input.additions,
    });
  } catch (error) {
    return {
      success: false,
      cause: error instanceof Error ? String(error.cause ?? "") : undefined,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo aplicar el ajuste.",
    };
  }
  revalidatePath(`/dashboard/store/orders/${input.orderId}`);
  revalidatePath(`/dashboard/store/orders/${input.orderId}/edit`);
  revalidateStoreOrderViews();
  return { success: true, message: "Ajuste aplicado correctamente." };
}

export async function fetchOrdersTotalsByProduct() {
  try {
    const orderRows = await fetchOrders();
    const totals = new Map<
      string,
      {
        productId: number;
        productVariantId: number | null;
        productVariantLabel: string | null;
        productName: string;
        status: OrderStatus;
        totalQuantity: number;
      }
    >();
    for (const order of orderRows) {
      for (const item of order.orderItems) {
        const key = `${item.productId}:${item.productVariantId ?? "base"}:${order.status}`;
        const current = totals.get(key);
        if (current) current.totalQuantity += item.quantity;
        else {
          totals.set(key, {
            productId: item.productId,
            productVariantId: item.productVariantId,
            productVariantLabel: item.productVariantLabel,
            productName: getOrderItemDisplayName(item),
            status: order.status,
            totalQuantity: item.quantity,
          });
        }
      }
    }
    return [...totals.values()];
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function storeGuestOrderToken(
  orderId: number,
  token: string,
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(`guest_order_${orderId}`, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/orders/${orderId}`,
    maxAge: 60 * 60 * 24 * 30,
  });
}
