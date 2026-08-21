import {
  toConcreteStoreCategory,
  type StoreCategory,
  type StoreCategoryScope,
} from "@/app/lib/store/category";

const PLAIN_NUMERIC_LITERAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

export function sanitizeCsvCell(value: unknown): string {
  const original = String(value);
  const leadingTrimmed = original.trimStart();

  if (
    leadingTrimmed &&
    ["=", "+", "-", "@"].includes(leadingTrimmed[0]) &&
    !PLAIN_NUMERIC_LITERAL.test(leadingTrimmed)
  ) {
    return `'${original}`;
  }

  return original;
}

export function serializeCsvRows(
  rows: readonly (readonly unknown[])[],
): string {
  return rows
    .map((row) =>
      row
        .map((cell) => `"${sanitizeCsvCell(cell).replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");
}

type CsvOrderItem = {
  productId: number;
  productVariantId: number | null;
  productVariantLabel: string | null;
  productNameAtPurchase: string | null;
  product: { name: string };
  quantity: number;
  priceAtPurchase: number;
  unitCostAtPurchase: number | null;
  transactionType: "purchase" | "rental";
  storeCategoryAtPurchase: StoreCategory;
};

type CsvOrder = {
  id: number;
  createdAt: Date;
  status: string;
  totalAmount: number;
  customer: {
    displayName: string | null;
    email: string | null;
    phoneNumber: string | null;
  } | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  orderItems: CsvOrderItem[];
};

function displayName(item: CsvOrderItem): string {
  const name = item.productNameAtPurchase ?? item.product.name;
  return item.productVariantLabel
    ? `${name} (${item.productVariantLabel})`
    : name;
}

function customerName(order: CsvOrder): string {
  return order.customer?.displayName ?? order.guestName ?? "Invitado";
}

/**
 * Whole-order fields always come from the complete DTO; only these scoped
 * lines are narrowed, so a mixed order still reports its real total.
 */
function scopedItems(
  order: CsvOrder,
  scope: StoreCategoryScope,
): CsvOrderItem[] {
  const category = toConcreteStoreCategory(scope);
  return category == null
    ? order.orderItems
    : order.orderItems.filter(
        (item) => item.storeCategoryAtPurchase === category,
      );
}

function isMixedOrder(order: CsvOrder): boolean {
  return (
    new Set(order.orderItems.map((item) => item.storeCategoryAtPurchase)).size >
    1
  );
}

export function serializeOrdersSummaryCsv(
  orders: readonly CsvOrder[],
  scope: StoreCategoryScope = "all",
): string {
  return serializeCsvRows([
    [
      "order_id",
      "created_at",
      "customer_type",
      "customer_name",
      "customer_email",
      "customer_phone",
      "status",
      "rental_status",
      "category_scope",
      "mixed_order",
      "item_count",
      "items_summary",
      "scoped_total_bs",
      "order_total_bs",
    ],
    ...orders.map((order) => {
      const items = scopedItems(order, scope);
      return [
        order.id,
        order.createdAt.toISOString(),
        order.customer ? "registered" : "guest",
        customerName(order),
        order.customer?.email ?? order.guestEmail ?? "",
        order.customer?.phoneNumber ?? order.guestPhone ?? "",
        order.status,
        order.orderItems.some((item) => item.transactionType === "rental")
          ? "has_rental"
          : "purchase_only",
        scope,
        isMixedOrder(order) ? "true" : "false",
        items.reduce((total, item) => total + item.quantity, 0),
        items.map((item) => `${item.quantity}x ${displayName(item)}`).join(", "),
        items
          .reduce(
            (total, item) => total + item.quantity * item.priceAtPurchase,
            0,
          )
          .toFixed(2),
        order.totalAmount.toFixed(2),
      ];
    }),
  ]);
}

export function serializeOrderLineItemsCsv(
  orders: readonly CsvOrder[],
  scope: StoreCategoryScope = "all",
): string {
  return serializeCsvRows([
    [
      "order_id",
      "created_at",
      "customer_name",
      "order_status",
      "transaction_type",
      "store_category",
      "product_id",
      "product_name",
      "variant_id",
      "variant_label",
      "quantity",
      "unit_price_bs",
      "line_revenue_bs",
      "unit_cost_bs",
      "line_cost_bs",
      "gross_profit_bs",
      "gross_margin_percent",
      "cost_status",
    ],
    ...orders.flatMap((order) =>
      scopedItems(order, scope).map((item) => {
        const revenue = item.priceAtPurchase * item.quantity;
        const isRental = item.transactionType === "rental";
        const cost =
          isRental || item.unitCostAtPurchase == null
            ? null
            : item.unitCostAtPurchase * item.quantity;
        const profit = cost == null ? null : revenue - cost;
        return [
          order.id,
          order.createdAt.toISOString(),
          customerName(order),
          order.status,
          item.transactionType,
          item.storeCategoryAtPurchase,
          item.productId,
          item.productNameAtPurchase ?? item.product.name,
          item.productVariantId ?? "",
          item.productVariantLabel ?? "",
          item.quantity,
          item.priceAtPurchase.toFixed(2),
          revenue.toFixed(2),
          isRental ? "" : (item.unitCostAtPurchase?.toFixed(2) ?? ""),
          cost?.toFixed(2) ?? "",
          profit?.toFixed(2) ?? "",
          profit == null || revenue === 0
            ? ""
            : ((profit / revenue) * 100).toFixed(2),
          isRental ? "unavailable" : cost == null ? "missing" : "known",
        ];
      }),
    ),
  ]);
}

export function serializeProfitabilityCsv(
  rows: readonly {
    orderId: number;
    date: Date;
    product: string;
    quantity: number;
    revenue: number;
    cost: number | null;
    profit: number | null;
    status: string;
    storeCategory: StoreCategory;
  }[],
): string {
  return serializeCsvRows([
    [
      "order_id",
      "created_at",
      "store_category",
      "product_variant",
      "quantity",
      "revenue_bs",
      "known_cost_bs",
      "gross_profit_bs",
      "gross_margin_percent",
      "cost_status",
      "order_status",
    ],
    ...rows.map((row) => [
      row.orderId,
      row.date.toISOString(),
      row.storeCategory,
      row.product,
      row.quantity,
      row.revenue.toFixed(2),
      row.cost?.toFixed(2) ?? "",
      row.profit?.toFixed(2) ?? "",
      row.profit == null || row.revenue === 0
        ? ""
        : ((row.profit / row.revenue) * 100).toFixed(2),
      row.cost == null ? "missing" : "known",
      row.status,
    ]),
  ]);
}
