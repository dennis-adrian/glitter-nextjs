import { DateTime } from "luxon";
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
  .refine((value) => {
    const parsed = DateTime.fromISO(value, { zone: "utc" });
    return parsed.isValid && parsed.toISODate() === value;
  })
  .optional()
  .catch(undefined);

export const storeOrdersQuerySchema = z.object({
  status: z.enum(STATUS_VALUES).catch("pending"),
  // Comma-separated status filters. `status` remains as a backwards-compatible
  // fallback for existing links and exports.
  statuses: z.string().trim().max(240).catch(""),
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

  const statuses = Array.from(
    new Set(
      query.statuses
        .split(",")
        .map((value) => value.trim())
        .filter((value): value is (typeof STATUS_VALUES)[number] =>
          (STATUS_VALUES as readonly string[]).includes(value),
        ),
    ),
  );

  // A custom range is the canonical representation whenever either boundary is
  // present. It avoids a contradictory `period=month&from=...` URL.
  return {
    ...query,
    statuses: statuses.join(","),
    ...(query.from || query.to ? { period: "custom" as const } : {}),
  };
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
  if (query.statuses) params.set("statuses", query.statuses);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.q) params.set("q", query.q);
  return params;
}

type ConcreteOrderStatus = (typeof orderStatusEnum.enumValues)[number];

export function resolveStoreOrdersStatusFilter(
  query: StoreOrdersQuery,
): ConcreteOrderStatus | readonly ConcreteOrderStatus[] | undefined {
  const selectedStatuses = query.statuses
    ? query.statuses
        .split(",")
        .map((value) => value.trim())
        .filter((value): value is (typeof STATUS_VALUES)[number] =>
          (STATUS_VALUES as readonly string[]).includes(value),
        )
    : [];
  const selectedAll = selectedStatuses.includes("all");
  const expandedStatuses = selectedStatuses.flatMap((value) =>
    value === "needs_attention"
      ? ["pending", "payment_verification"]
      : value === "all"
        ? []
        : [value],
  );
  if (expandedStatuses.length) {
    return Array.from(new Set(expandedStatuses)) as ConcreteOrderStatus[];
  }
  if (selectedAll || query.status === "all") {
    return undefined;
  }
  if (query.status === "needs_attention") {
    return ["pending", "payment_verification"] as const;
  }
  return query.status;
}
