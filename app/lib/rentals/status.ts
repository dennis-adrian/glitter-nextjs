import type {
  ProductTransactionType,
  RentalStatus,
} from "@/app/lib/rentals/types";

export function deriveRentalStatus(input: {
  transactionType: ProductTransactionType;
  quantity: number;
  rentalReturnedQuantity: number;
}): RentalStatus {
  if (input.transactionType !== "rental") return "not_applicable";
  if (input.rentalReturnedQuantity <= 0) return "out";
  if (input.rentalReturnedQuantity >= input.quantity) return "returned";
  return "partially_returned";
}

export function getRentalOutstandingQuantity(input: {
  quantity: number;
  rentalReturnedQuantity: number;
}): number {
  return Math.max(0, input.quantity - input.rentalReturnedQuantity);
}

export function getRentalStatusLabel(status: RentalStatus): string {
  switch (status) {
    case "out":
      return "En alquiler";
    case "partially_returned":
      return "Parcialmente devuelto";
    case "returned":
      return "Devuelto";
    default:
      return "";
  }
}
