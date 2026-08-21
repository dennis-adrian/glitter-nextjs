import { z } from "zod";

import { orderStatusEnum } from "@/db/schema";
import type { RentalOrderFilter } from "@/app/lib/rentals/order-filters";

const STATUS_VALUES = [
  ...orderStatusEnum.enumValues,
  "all",
  "needs_attention",
] as const;

const RENTAL_VALUES = [
  "all",
  "has_rental",
  "out",
  "partially_returned",
  "returned",
] as const satisfies readonly RentalOrderFilter[];

const PERIOD_VALUES = ["all", "today", "week", "month", "custom"] as const;
const VIEW_VALUES = ["comfortable", "compact"] as const;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);

export const storeOrdersQuerySchema = z.object({
  status: z.enum(STATUS_VALUES).catch("pending"),
  rental: z.enum(RENTAL_VALUES).catch("all"),
  period: z.enum(PERIOD_VALUES).catch("all"),
  from: isoDate,
  to: isoDate,
  q: z.string().trim().max(120).catch("").default(""),
  view: z.enum(VIEW_VALUES).catch("compact"),
});

export type StoreOrdersQuery = z.infer<typeof storeOrdersQuerySchema>;

export function parseStoreOrdersQuery(
  searchParams: Record<string, string | string[] | undefined>,
): StoreOrdersQuery {
  const firstValues = Object.fromEntries(
    Object.entries(searchParams).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
  const query = storeOrdersQuerySchema.parse(firstValues);

  // A custom range is the canonical representation whenever either boundary is
  // present. It avoids a contradictory `period=month&from=...` URL.
  return query.from || query.to ? { ...query, period: "custom" } : query;
}

export function storeOrdersQueryToSearchParams(
  query: StoreOrdersQuery,
): URLSearchParams {
  const params = new URLSearchParams({
    status: query.status,
    rental: query.rental,
    period: query.period,
    view: query.view,
  });
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.q) params.set("q", query.q);
  return params;
}
