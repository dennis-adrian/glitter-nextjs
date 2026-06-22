import {
  deriveRentalStatus,
} from "@/app/lib/rentals/status";
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

  return rentalItems.some((item) => {
    const status = deriveRentalStatus({
      transactionType: item.transactionType,
      quantity: item.quantity,
      rentalReturnedQuantity: item.rentalReturnedQuantity,
    });
    return status === filter;
  });
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

  const statuses = rentalItems.map((item) =>
    deriveRentalStatus({
      transactionType: item.transactionType,
      quantity: item.quantity,
      rentalReturnedQuantity: item.rentalReturnedQuantity,
    }),
  );

  if (statuses.every((status) => status === "returned")) return "returned";
  if (statuses.every((status) => status === "out")) return "out";
  if (statuses.some((status) => status === "partially_returned")) {
    return "partially_returned";
  }
  if (statuses.some((status) => status === "out")) return "out";
  return "partially_returned";
}
