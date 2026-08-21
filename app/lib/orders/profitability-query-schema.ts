import { DateTime } from "luxon";
import { z } from "zod";

import { STORE_TIMEZONE } from "@/app/lib/formatters";

const PERIOD_VALUES = ["all", "today", "week", "month", "custom"] as const;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);

export const profitabilityQuerySchema = z.object({
  period: z.enum(PERIOD_VALUES).catch("month"),
  from: isoDate,
  to: isoDate,
});

export type ProfitabilityQuery = z.infer<typeof profitabilityQuerySchema>;

export function parseProfitabilityQuery(
  searchParams: Record<string, string | string[] | undefined>,
): ProfitabilityQuery {
  const firstValues = Object.fromEntries(
    Object.entries(searchParams).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
  const query = profitabilityQuerySchema.parse(firstValues);
  return query.from || query.to ? { ...query, period: "custom" } : query;
}

export function profitabilityQueryToSearchParams(
  query: ProfitabilityQuery,
): URLSearchParams {
  const params = new URLSearchParams({ period: query.period });
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  return params;
}

export function getProfitabilityDateRange(
  query: ProfitabilityQuery,
  now = DateTime.now().setZone(STORE_TIMEZONE),
): { from?: Date; to?: Date } {
  if (query.period === "custom") {
    return {
      from: query.from
        ? DateTime.fromISO(query.from, { zone: STORE_TIMEZONE })
            .startOf("day")
            .toJSDate()
        : undefined,
      to: query.to
        ? DateTime.fromISO(query.to, { zone: STORE_TIMEZONE })
            .endOf("day")
            .toJSDate()
        : undefined,
    };
  }

  if (query.period === "all") return {};

  const from =
    query.period === "today"
      ? now.startOf("day")
      : query.period === "week"
        ? now.startOf("week")
        : now.startOf("month");
  return { from: from.toJSDate(), to: now.endOf("day").toJSDate() };
}
