import type { OrderStatus } from "@/app/lib/orders/definitions";

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["processing", "paid", "cancelled"],
  payment_verification: ["processing", "paid", "cancelled"],
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

export function canCancelOrderStatus(status: OrderStatus): boolean {
  return canTransitionOrderStatus(status, "cancelled");
}

/**
 * Upper bound for a single bulk status change. Each order is updated in its own
 * transaction, so this keeps one request from holding locks for too long.
 */
export const BULK_ORDER_STATUS_LIMIT = 100;
