"use server";

import { cookies } from "next/headers";
import {
  orderItems,
  orders,
  productContentSections,
  products,
  productVariantOptionValues,
  productVariants,
} from "@/db/schema";
import { OrderStatus, OrderWithRelations } from "@/app/lib/orders/definitions";
import {
  ORDER_TAB_VALUES,
  type OrderTabValue,
} from "@/app/lib/orders/order-tabs";
import { db } from "@/db";
import { and, count, desc, eq, exists, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { sendEmail } from "@/app/vendors/resend";
import { fetchAdminUsers } from "@/app/api/users/actions";
import OrderConfirmationForAdminsEmailTemplate from "@/app/emails/order-confirmation-for-admins";
import OrderConfirmationForUsersEmailTemplate from "@/app/emails/order-confirmation-for-user";
import OrderPaymentConfirmationForUserEmailTemplate from "@/app/emails/order-payment-confirmation-for-user";
import OrderVoucherSubmittedForAdminsEmailTemplate from "@/app/emails/order-voucher-submitted-for-admins";
import OrderUpdatedForUserEmailTemplate from "@/app/emails/order-updated-for-user";
import OrderUpdatedForAdminsEmailTemplate from "@/app/emails/order-updated-for-admins";
import { getVariantLabel } from "@/app/lib/products/variants";
import { assertRentalEligibility } from "@/app/lib/rentals/eligibility";
import { resolveRentalLineContext } from "@/app/lib/rentals/rental-context";
import {
  consumeLineStockInTx,
  getAvailableStockForLine,
  restoreLineStockInTx,
  validateCombinedSharedStockDemand,
} from "@/app/lib/rentals/order-stock";
import { getStockPoolForTransaction } from "@/app/lib/rentals/stock";
import {
  buildRentalContentSectionsSnapshot,
  filterContentSectionsForMode,
} from "@/app/lib/rentals/validation";
import type { ProductTransactionType } from "@/app/lib/rentals/types";
import type { RentalOrderFilter } from "@/app/lib/rentals/order-filters";
import { getPostHogClient } from "@/app/lib/posthog-server";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";
import {
  getOrderItemDisplayName,
  getLineUnitPrice,
  getProductPriceAtPurchase,
  getRentalPriceAtPurchase,
} from "@/app/lib/orders/utils";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

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

async function restoreOrderItemStock(
  tx: OrderTx,
  item: Pick<
    (typeof orderItems)["$inferSelect"],
    | "productId"
    | "productVariantId"
    | "quantity"
    | "transactionType"
    | "rentalStockModeSnapshot"
    | "rentalReturnedQuantity"
  >,
) {
  await restoreLineStockInTx(tx, item);
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
    productVariantId != null ? (variantMap.get(productVariantId) ?? null) : null;
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
      rentalLines.map(
        (line) => `${line.rentalFestivalId}:${line.rentalReservationId}`,
      ),
    );
    if (rentalContexts.size > 1) {
      throw new Error(
        "Todos los productos de alquiler deben usar el mismo festival/reserva.",
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

    const resolvedContext = resolveRentalLineContext(
      eligibility.contexts,
      sampleRentalLine.rentalFestivalId,
      sampleRentalLine.rentalReservationId,
    );
    if (!resolvedContext.ok) {
      throw new Error(resolvedContext.message, { cause: resolvedContext.cause });
    }

    orderLines = orderLines.map((line) => {
      if ((line.transactionType ?? "purchase") !== "rental") return line;
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

  for (const line of resolvedLines) {
    await tx.insert(orderItems).values({
      productId: line.product.id,
      productVariantId: line.productVariantId,
      productVariantLabel: line.productVariantLabel,
      quantity: line.quantity,
      priceAtPurchase: line.unitPrice,
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
  if (
    lines.some((line) => (line.transactionType ?? "purchase") === "rental")
  ) {
    throw new Error("Los productos de alquiler requieren una cuenta verificada.", {
      cause: "rental_ineligible",
    });
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

  for (const line of resolvedLines) {
    await tx.insert(orderItems).values({
      productId: line.product.id,
      productVariantId: line.productVariantId,
      productVariantLabel: line.productVariantLabel,
      quantity: line.quantity,
      priceAtPurchase: line.unitPrice,
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

    return order;
  } catch (error) {
    console.error(error);
    return null;
  }
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

    return order ?? null;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function fetchOrdersByUserId(userId: number) {
  try {
    return await db.query.orders.findMany({
      where: eq(orders.userId, userId),
      orderBy: [desc(orders.createdAt)],
      with: orderRelations,
    });
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
    return await db.query.orders.findMany({
      where: and(eq(orders.userId, userId), eq(orders.status, status)),
      orderBy: [desc(orders.createdAt)],
      with: orderRelations,
    });
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function fetchOrders() {
  try {
    return await db.query.orders.findMany({
      with: orderRelations,
    });
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function fetchOrdersByStatus(
  status?: OrderStatus | readonly OrderStatus[],
  rentalFilter: RentalOrderFilter = "all",
) {
  try {
    const statusWhere =
      status === undefined
        ? undefined
        : typeof status === "string"
          ? eq(orders.status, status)
          : inArray(orders.status, status);

    const rentalWhere = buildRentalFilterSql(rentalFilter);
    const whereClause =
      statusWhere && rentalWhere
        ? and(statusWhere, rentalWhere)
        : (statusWhere ?? rentalWhere);

    return await db.query.orders.findMany({
      where: whereClause,
      orderBy: [desc(orders.createdAt)],
      with: orderRelations,
    });
  } catch (error) {
    console.error(error);
    return [];
  }
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

  if (filter === "out") {
    return exists(
      db
        .select({ one: sql`1` })
        .from(orderItems)
        .where(
          and(
            eq(orderItems.orderId, orders.id),
            eq(orderItems.transactionType, "rental"),
            eq(orderItems.rentalReturnedQuantity, 0),
          ),
        ),
    );
  }

  if (filter === "partially_returned") {
    return exists(
      db
        .select({ one: sql`1` })
        .from(orderItems)
        .where(
          and(
            eq(orderItems.orderId, orders.id),
            eq(orderItems.transactionType, "rental"),
            sql`${orderItems.rentalReturnedQuantity} > 0`,
            sql`${orderItems.rentalReturnedQuantity} < ${orderItems.quantity}`,
          ),
        ),
    );
  }

  return exists(
    db
      .select({ one: sql`1` })
      .from(orderItems)
      .where(
        and(
          eq(orderItems.orderId, orders.id),
          eq(orderItems.transactionType, "rental"),
          sql`${orderItems.rentalReturnedQuantity} >= ${orderItems.quantity}`,
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
    return await db.query.orders.findMany({
      where: eq(orders.status, "payment_verification"),
      orderBy: [desc(orders.voucherSubmittedAt)],
      with: orderRelations,
    });
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function acceptOrder(orderId: number) {
  try {
    await db
      .update(orders)
      .set({ status: "paid" })
      .where(eq(orders.id, orderId));
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "No se pudo aceptar la orden.",
    };
  }

  revalidateStoreOrderViews();
  return {
    success: true,
    message: "Orden aceptada correctamente.",
  };
}

export async function deleteOrder(orderId: number) {
  try {
    await db.delete(orders).where(eq(orders.id, orderId));
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "No se pudo eliminar la orden.",
    };
  }

  revalidateStoreOrderViews();
  return {
    success: true,
    message: "Orden eliminada correctamente.",
  };
}

export async function updateOrderStatus(orderId: number, status: OrderStatus) {
  const orderBefore = await fetchOrder(orderId);

  try {
    await db.update(orders).set({ status }).where(eq(orders.id, orderId));
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "No se pudo actualizar el pedido.",
    };
  }

  if (status === "paid" && orderBefore && orderBefore.status !== "paid") {
    const recipientEmail =
      orderBefore.customer?.email ?? orderBefore.guestEmail;
    const recipientName =
      orderBefore.customer?.displayName ??
      orderBefore.customer?.firstName ??
      orderBefore.guestName ??
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
            total: orderBefore.totalAmount,
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
    console.error("URL de comprobante de pago inválida", urlString);
    return false;
  }
}

export async function submitOrderPaymentVoucher(
  orderId: number,
  voucherUrl: string,
) {
  const currentUser = await getCurrentUserProfile();
  if (!currentUser) {
    return {
      success: false,
      message: "Debes iniciar sesión para enviar el comprobante.",
    };
  }

  if (!isAllowedVoucherUrl(voucherUrl)) {
    return {
      success: false,
      message: "Invalid voucher URL source",
    };
  }

  try {
    const [order] = await db
      .update(orders)
      .set({
        paymentVoucherUrl: voucherUrl,
        status: "payment_verification",
        voucherSubmittedAt: new Date(),
      })
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.userId, currentUser.id),
          eq(orders.status, "pending"),
        ),
      )
      .returning();

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
      await posthog.shutdown();
    } catch (posthogError) {
      console.error("[submitOrderPaymentVoucher] PostHog capture failed", {
        orderId,
        error: posthogError,
      });
    }

    return { success: true, message: "Comprobante enviado correctamente." };
  } catch (error) {
    console.error(error);
    return { success: false, message: "No se pudo enviar el comprobante." };
  }
}

export async function submitGuestOrderPaymentVoucher(
  orderId: number,
  token: string,
  voucherUrl: string,
) {
  if (!isAllowedVoucherUrl(voucherUrl)) {
    return { success: false, message: "Invalid voucher URL source" };
  }

  try {
    const [order] = await db
      .update(orders)
      .set({
        paymentVoucherUrl: voucherUrl,
        status: "payment_verification",
        voucherSubmittedAt: new Date(),
      })
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.guestOrderToken, token),
          isNull(orders.userId),
          eq(orders.status, "pending"),
        ),
      )
      .returning();

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
        distinctId: `guest_${token}`,
        event: POSTHOG_EVENTS.ORDER_PAYMENT_VOUCHER_UPLOADED,
        properties: { order_id: orderId, is_guest: true },
      });
      await posthog.shutdown();
    } catch (posthogError) {
      console.error("[submitGuestOrderPaymentVoucher] PostHog capture failed", {
        orderId,
        error: posthogError,
      });
    }

    return { success: true, message: "Comprobante enviado correctamente." };
  } catch (error) {
    console.error(error);
    return { success: false, message: "No se pudo enviar el comprobante." };
  }
}

export async function adminAttachOrderVoucher(
  orderId: number,
  voucherUrl: string,
) {
  const currentUser = await getCurrentUserProfile();
  if (!currentUser || currentUser.role !== "admin") {
    return {
      success: false,
      message: "No tienes permisos para realizar esta acción.",
    };
  }

  if (!isAllowedVoucherUrl(voucherUrl)) {
    return { success: false, message: "URL de comprobante inválida." };
  }

  try {
    const [order] = await db
      .update(orders)
      .set({
        paymentVoucherUrl: voucherUrl,
        voucherSubmittedAt: new Date(),
        status: "payment_verification",
      })
      .where(
        and(
          eq(orders.id, orderId),
          inArray(orders.status, ["pending", "payment_verification"]),
        ),
      )
      .returning();

    if (!order) {
      return { success: false, message: "Orden no encontrada o ya procesada." };
    }
  } catch (error) {
    console.error(error);
    return { success: false, message: "No se pudo guardar el comprobante." };
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

type OrderChange = {
  productName: string;
  oldQuantity: number;
  newQuantity: number;
};

async function sendOrderUpdatedEmails(data: {
  orderId: number;
  customerEmail: string;
  customerName: string;
  changes: OrderChange[];
  newTotal: number;
}) {
  const { orderId, customerEmail, customerName, changes, newTotal } = data;

  await sendEmail({
    to: [customerEmail],
    from: "Glitter Store <reservas@productoraglitter.com>",
    subject: `Tu orden #${orderId} fue modificada`,
    react: OrderUpdatedForUserEmailTemplate({
      customerName,
      orderId: String(orderId),
      changes,
      newTotal,
    }) as React.ReactElement,
  });

  const admins = await fetchAdminUsers();
  const adminEmails = admins.map((a) => a.email).filter(Boolean);

  if (adminEmails.length > 0) {
    await sendEmail({
      to: adminEmails,
      from: "Glitter Store <store@productoraglitter.com>",
      replyTo: "soporte@productoraglitter.com",
      subject: `Orden #${orderId} modificada por ${customerName || "Cliente"}`,
      react: OrderUpdatedForAdminsEmailTemplate({
        customerName,
        orderId: String(orderId),
        changes,
        newTotal,
      }) as React.ReactElement,
    });
  }
}

export async function updateOrder(
  orderId: number,
  profileId: number,
  items: UpdateOrderItemInput[],
  clientUpdatedAt: string,
): Promise<UpdateOrderResult> {
  // 1. Auth
  const currentUser = await getCurrentUserProfile();
  if (!currentUser) {
    return {
      success: false,
      message: "Debes iniciar sesión para editar un pedido.",
      cause: "forbidden",
    };
  }

  // 2. Fetch order
  const order = await fetchOrder(orderId);
  if (!order) {
    return {
      success: false,
      message: "Orden no encontrada.",
      cause: "not_found",
    };
  }

  // 3. Ownership + status guards (guest orders have no userId and cannot be edited here)
  if (order.userId !== currentUser.id && currentUser.role !== "admin") {
    return {
      success: false,
      message: "No tienes permiso para editar este pedido.",
      cause: "forbidden",
    };
  }

  if (order.status !== "pending") {
    return {
      success: false,
      message: "Solo puedes editar pedidos pendientes.",
    };
  }

  // 4. Optimistic concurrency check
  if (order.updatedAt.toISOString() !== clientUpdatedAt) {
    return {
      success: false,
      cause: "conflict",
      message:
        "El pedido fue modificado en otra sesión. Por favor recargá la página.",
    };
  }

  // 5. Build edit map and validate all item IDs belong to this order
  const editMap = new Map<number, number>(
    items.map((i) => [i.orderItemId, i.quantity]),
  );
  const orderItemIds = new Set(order.orderItems.map((i) => i.id));
  for (const itemId of editMap.keys()) {
    if (!orderItemIds.has(itemId)) {
      return {
        success: false,
        message: "Artículo no pertenece a este pedido.",
        cause: "forbidden",
      };
    }
  }

  // 6. Price-lock guard (server-side mirror of UI restriction)
  for (const orderItem of order.orderItems) {
    const newQty = editMap.get(orderItem.id);
    // Skip items that weren't submitted (unchanged) or aren't being changed
    if (newQty === undefined || newQty === orderItem.quantity) continue;
    const currentPrice = getLineUnitPrice(
      orderItem.product,
      orderItem.variant,
      orderItem.transactionType,
    );
    if (Math.abs(currentPrice - orderItem.priceAtPurchase) > 0.001) {
      return {
        success: false,
        message: `No puedes modificar "${getOrderItemDisplayName(orderItem)}" porque su precio cambió desde que realizaste el pedido.`,
      };
    }
  }

  // 7. Determine if this is a full cancellation
  const willCancelOrder = items.every((i) => i.quantity === 0);

  // 8. DB Transaction
  try {
    await db.transaction(async (tx) => {
      // Re-fetch order row with lock to prevent races
      const [freshOrder] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.status, "pending")))
        .for("update");

      if (!freshOrder) {
        throw Object.assign(
          new Error("Orden no encontrada o ya no está pendiente."),
          { cause: "not_found" },
        );
      }
      if (freshOrder.updatedAt.toISOString() !== clientUpdatedAt) {
        throw Object.assign(
          new Error(
            "El pedido fue modificado en otra sesión. Por favor recargá la página.",
          ),
          { cause: "conflict" },
        );
      }

      if (willCancelOrder) {
        // Restore all stock and cancel
        for (const item of order.orderItems) {
          await restoreOrderItemStock(tx, item);
        }
        await tx
          .update(orders)
          .set({ status: "cancelled", updatedAt: sql`now()` })
          .where(eq(orders.id, orderId));
      } else {
        // Restore old quantities to stock for all edited items
        for (const [itemId] of editMap) {
          const orderItem = order.orderItems.find((i) => i.id === itemId)!;
          await restoreOrderItemStock(tx, orderItem);
        }

        // Re-fetch affected product lines FOR UPDATE and validate stock
        const linesToResolve = Array.from(editMap.entries())
          .filter(([, qty]) => qty > 0)
          .map(([itemId, quantity]) => {
            const orderItem = order.orderItems.find(
              (entry) => entry.id === itemId,
            )!;
            return {
              productId: orderItem.productId,
              productVariantId: orderItem.productVariantId,
              quantity,
              transactionType: orderItem.transactionType,
              rentalFestivalId: orderItem.rentalFestivalId,
              rentalReservationId: orderItem.rentalReservationId,
            };
          });

        const resolvedLines =
          linesToResolve.length > 0
            ? await resolveOrderLines(tx, linesToResolve)
            : [];

        // Apply changes: delete removed items, update quantities, deduct new stock
        for (const [itemId, newQty] of editMap) {
          if (newQty === 0) {
            await tx.delete(orderItems).where(eq(orderItems.id, itemId));
          } else {
            await tx
              .update(orderItems)
              .set({ quantity: newQty, updatedAt: sql`now()` })
              .where(eq(orderItems.id, itemId));

            const orderItem = order.orderItems.find((i) => i.id === itemId)!;
            const [product] = await tx
              .select()
              .from(products)
              .where(eq(products.id, orderItem.productId))
              .limit(1);
            const variantMap = new Map<number, typeof productVariants.$inferSelect>();
            if (orderItem.productVariantId != null) {
              const [variant] = await tx
                .select()
                .from(productVariants)
                .where(eq(productVariants.id, orderItem.productVariantId))
                .limit(1);
              if (variant) {
                variantMap.set(variant.id, variant);
              }
            }
            if (product) {
              await consumeOrderItemStock(
                tx,
                product,
                orderItem.productVariantId,
                newQty,
                orderItem.transactionType,
                variantMap,
              );
            }
          }
        }

        // Recalculate total using priceAtPurchase
        const newTotal = order.orderItems.reduce((acc, item) => {
          const newQty = editMap.get(item.id);
          if (newQty === 0) return acc; // removed
          const qty = newQty !== undefined ? newQty : item.quantity; // changed or unchanged
          return acc + item.priceAtPurchase * qty;
        }, 0);

        await tx
          .update(orders)
          .set({ totalAmount: newTotal, updatedAt: sql`now()` })
          .where(eq(orders.id, orderId));
      }
    });
  } catch (error) {
    console.error(error);
    if (error instanceof Error) {
      if (error.cause === "conflict") {
        return { success: false, cause: "conflict", message: error.message };
      }
      if (error.cause === "stock_insufficient") {
        return {
          success: false,
          cause: "stock_insufficient",
          message: error.message,
        };
      }
      if (error.cause === "not_found") {
        return { success: false, cause: "not_found", message: error.message };
      }
    }
    return { success: false, message: "No se pudo actualizar el pedido." };
  }

  // 9. Revalidate
  revalidatePath(`/profiles/${profileId}/orders/${orderId}`);
  revalidatePath(`/profiles/${profileId}/orders/${orderId}/edit`);
  revalidatePath("/my_orders");
  revalidateStoreOrderViews();

  // 10. Build change summary and send emails (outside transaction, non-fatal)
  const changes: OrderChange[] = order.orderItems
    .filter((item) => editMap.has(item.id))
    .map((item) => ({
      productName: getOrderItemDisplayName(item),
      oldQuantity: item.quantity,
      newQuantity: editMap.get(item.id)!,
    }));

  const newTotal = willCancelOrder
    ? 0
    : order.orderItems.reduce((acc, item) => {
        const newQty = editMap.get(item.id);
        if (newQty === 0) return acc;
        const qty = newQty !== undefined ? newQty : item.quantity;
        return acc + item.priceAtPurchase * qty;
      }, 0);

  try {
    await sendOrderUpdatedEmails({
      orderId,
      customerEmail: order.customer?.email ?? order.guestEmail ?? "",
      customerName:
        order.customer?.displayName ??
        order.customer?.firstName ??
        order.guestName ??
        "Cliente",
      changes,
      newTotal,
    });
  } catch (emailError) {
    console.error("Failed to send order updated emails", emailError);
  }

  return {
    success: true,
    wasCancelled: willCancelOrder,
    message: willCancelOrder
      ? "Tu pedido fue cancelado."
      : "Tu pedido fue actualizado correctamente.",
  };
}

export async function fetchOrdersTotalsByProduct() {
  try {
    const result = await db.transaction(async (tx) => {
      const totals = await tx
        .select({
          productId: orderItems.productId,
          productVariantId: orderItems.productVariantId,
          productVariantLabel: orderItems.productVariantLabel,
          productName: sql<string>`CASE
            WHEN ${orderItems.productVariantLabel} IS NOT NULL
              THEN ${products.name} || ' (' || ${orderItems.productVariantLabel} || ')'
            ELSE ${products.name}
          END`,
          status: orders.status,
          totalQuantity: sql<number>`cast(sum(${orderItems.quantity}) as integer)`,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .innerJoin(products, eq(orderItems.productId, products.id))
        .groupBy(
          orderItems.productId,
          orderItems.productVariantId,
          orderItems.productVariantLabel,
          products.name,
          orders.status,
        );

      return totals;
    });

    return result;
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
