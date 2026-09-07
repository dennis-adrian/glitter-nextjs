import {
  BaseProduct,
  ProductVariantWithSelections,
} from "@/app/lib/products/definitions";
import {
  toConcreteStoreCategory,
  type StoreCategory,
  type StoreCategoryScope,
} from "@/app/lib/store/category";
import {
  AdminOrderListRow,
  OrderStatus,
  OrderWithRelations,
} from "./definitions";

export function getOrderItemCount(order: OrderWithRelations): number {
  const itemQuantities = order.orderItems.map((item) => item.quantity);
  return itemQuantities.reduce((acc, quantity) => acc + quantity, 0);
}

/**
 * Describes a complete order under one scope. Effective lines already exclude
 * zeroed quantities, so a fully returned line never marks an order as mixed.
 */
export function toAdminOrderListRow(
  order: OrderWithRelations,
  scope: StoreCategoryScope,
): AdminOrderListRow {
  const positiveLines = order.orderItems.filter((item) => item.quantity > 0);
  const storeCategories = [
    ...new Set(positiveLines.map((item) => item.storeCategoryAtPurchase)),
  ] as StoreCategory[];
  const category = toConcreteStoreCategory(scope);
  const scopedLines =
    category == null
      ? positiveLines
      : positiveLines.filter(
          (item) => item.storeCategoryAtPurchase === category,
        );

  return {
    ...order,
    storeCategories,
    scopedSubtotal: scopedLines.reduce(
      (total, item) => total + item.quantity * item.priceAtPurchase,
      0,
    ),
    isMixedCategory: storeCategories.length > 1,
  };
}

export function hasPreorders(order: OrderWithRelations): boolean {
  const presaleItems = order.orderItems.find(
    (item) => item.product.status === "presale",
  );
  return !!presaleItems;
}

export function getOrderStatusLabel(status: OrderStatus): string {
  switch (status) {
    case "pending":
      return "Pendiente";
    case "payment_verification":
      return "Pago en verificación";
    case "processing":
      return "En proceso";
    case "delivered":
      return "Entregado";
    case "cancelled":
      return "Cancelado";
    case "paid":
      return "Pagado";
    default:
      return "Desconocido";
  }
}

export function validatedDiscount(
  price: number,
  discount: number,
  discountUnit: BaseProduct["discountUnit"],
): number {
  switch (discountUnit) {
    case "percentage":
      return Math.min(Math.max(discount, 0), 100);
    case "amount":
      return Math.min(Math.max(discount, 0), price);
    default:
      return 0;
  }
}

export function getRentalPriceAtPurchase(
  product: Pick<BaseProduct, "rentalPrice">,
): number {
  if (product.rentalPrice == null) {
    throw new Error("Missing rental price");
  }
  return product.rentalPrice;
}

export function getLineUnitPrice(
  product: BaseProduct,
  variant: Pick<ProductVariantWithSelections, "price"> | null | undefined,
  transactionType: "purchase" | "rental" = "purchase",
): number {
  if (transactionType === "rental") {
    return getRentalPriceAtPurchase(product);
  }
  return getProductPriceAtPurchase(product, variant);
}

export function getProductPriceAtPurchase(
  product: BaseProduct,
  variant?: Pick<ProductVariantWithSelections, "price"> | null,
): number {
  if (variant?.price != null) {
    return variant.price;
  }

  const basePrice = product.price;
  if (!product.discount) return basePrice;

  const validDiscount = validatedDiscount(
    basePrice,
    product.discount,
    product.discountUnit,
  );

  switch (product.discountUnit) {
    case "percentage":
      return basePrice * (1 - validDiscount / 100);
    case "amount":
      return basePrice - validDiscount;
    default:
      return basePrice;
  }
}

export function getOrderItemDisplayName(item: {
  product: Pick<BaseProduct, "name">;
  productNameAtPurchase?: string | null;
  productVariantLabel?: string | null;
}): string {
  const productName = item.productNameAtPurchase ?? item.product.name;
  if (!item.productVariantLabel) {
    return productName;
  }

  return `${productName} (${item.productVariantLabel})`;
}
