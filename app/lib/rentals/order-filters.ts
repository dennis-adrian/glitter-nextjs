import type { RentalStatus } from "@/app/lib/rentals/types";

export type RentalOrderFilter =
  | "all"
  | "has_rental"
  | "out"
  | "partially_returned"
  | "returned";

type RentalFilterOrderItem = {
  transactionType: "purchase" | "rental";
  quantity: number;
  rentalReturnedQuantity: number;
};

type RentalFilterOrder = {
  orderItems: RentalFilterOrderItem[];
};

export function orderMatchesRentalFilter(
  order: RentalFilterOrder,
  filter: RentalOrderFilter,
): boolean {
  if (filter === "all") return true;

  const rentalItems = order.orderItems.filter(
    (item) => item.transactionType === "rental",
  );

  if (filter === "has_rental") {
    return rentalItems.length > 0;
  }

  const orderStatus = getOrderRentalSummary(order);
  return orderStatus === filter;
}

export function getRentalOrderFilterLabel(filter: RentalOrderFilter): string {
  switch (filter) {
    case "has_rental":
      return "Con alquiler";
    case "out":
      return "En alquiler";
    case "partially_returned":
      return "Parcialmente devuelto";
    case "returned":
      return "Devuelto";
    default:
      return "Todos";
  }
}

export function getOrderRentalSummary(order: RentalFilterOrder): RentalStatus | null {
  const rentalItems = order.orderItems.filter(
    (item) => item.transactionType === "rental",
  );
  if (rentalItems.length === 0) return null;

  const hasAnyReturn = rentalItems.some(
    (item) => item.rentalReturnedQuantity > 0,
  );
  const hasAnyOutstanding = rentalItems.some(
    (item) => item.rentalReturnedQuantity < item.quantity,
  );

  if (!hasAnyReturn) return "out";
  if (!hasAnyOutstanding) return "returned";
  return "partially_returned";
}
