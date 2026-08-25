import type { OrderStatus } from "@/app/lib/orders/definitions";

export type OrderStatusCounts = Record<OrderStatus, number> & {
  all: number;
  needs_attention: number;
};

const EMPTY_STATUS_COUNTS: OrderStatusCounts = {
  pending: 0,
  payment_verification: 0,
  processing: 0,
  paid: 0,
  delivered: 0,
  cancelled: 0,
  all: 0,
  needs_attention: 0,
};

export function emptyOrderStatusCounts(): OrderStatusCounts {
  return { ...EMPTY_STATUS_COUNTS };
}

export function buildOrderStatusCounts(
  rows: readonly { status: OrderStatus; count: number | null | undefined }[],
): OrderStatusCounts {
  const counts = emptyOrderStatusCounts();
  for (const row of rows) {
    const value = Number(row.count ?? 0);
    counts[row.status] = value;
    counts.all += value;
  }
  counts.needs_attention = counts.pending + counts.payment_verification;
  return counts;
}
