import type { OrderStatus } from "@/app/lib/orders/definitions";

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["processing", "paid", "cancelled"],
  payment_verification: ["paid", "cancelled"],
  processing: ["paid", "cancelled"],
  paid: ["delivered"],
  delivered: [],
  cancelled: [],
};

export function canTransitionOrderStatus(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}
