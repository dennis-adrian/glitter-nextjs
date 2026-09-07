import type { OrderWithRelations } from "@/app/lib/orders/definitions";
import {
  toConcreteStoreCategory,
  type StoreCategoryScope,
} from "@/app/lib/store/category";
import { DateTime } from "luxon";

export type SalesChartMode = "revenue" | "orders";

type SalesChartRange = { from?: Date; to?: Date };

type BuildSalesChartDataInput = {
  orders: OrderWithRelations[];
  category: StoreCategoryScope;
  range: SalesChartRange;
  mode: SalesChartMode;
  now?: Date;
};

export type SalesChartPoint = {
  date: string;
  value: number;
};

export type SalesChartModel = {
  data: SalesChartPoint[];
  title: string;
};

const STORE_ZONE = "America/La_Paz";

function formatRange(start: DateTime, end: DateTime) {
  const startFormat = start.hasSame(end, "year") ? "d MMM" : "d MMM yyyy";
  return `${start.toFormat(startFormat, { locale: "es" })} – ${end.toFormat(
    "d MMM yyyy",
    { locale: "es" },
  )}`;
}

export function buildSalesChartData({
  orders,
  category,
  range,
  mode,
  now = new Date(),
}: BuildSalesChartDataInput): SalesChartModel {
  const concreteCategory = toConcreteStoreCategory(category);
  const end = range.to
    ? DateTime.fromJSDate(range.to).setZone(STORE_ZONE)
    : DateTime.fromJSDate(now).setZone(STORE_ZONE);
  const explicitStart = range.from
    ? DateTime.fromJSDate(range.from).setZone(STORE_ZONE)
    : null;
  const datedOrders = orders
    .map((order) => ({
      order,
      date: DateTime.fromJSDate(new Date(order.createdAt)).setZone(STORE_ZONE),
    }))
    .filter(({ date }) => date.isValid && date <= end);
  const earliestOrder = datedOrders.reduce<DateTime | null>(
    (earliest, { date }) =>
      earliest == null || date < earliest ? date : earliest,
    null,
  );
  const unresolvedStart = explicitStart ?? earliestOrder ?? end.startOf("day");
  const start = unresolvedStart <= end ? unresolvedStart : end.startOf("day");
  const spanDays = Math.max(
    0,
    Math.floor(end.startOf("day").diff(start.startOf("day"), "days").days),
  );
  const monthly = spanDays > 92;
  const keyFormat = monthly ? "yyyy-MM" : "yyyy-MM-dd";
  const buckets: { key: string; label: string }[] = [];

  if (monthly) {
    let cursor = start.startOf("month");
    const lastMonth = end.startOf("month");
    while (cursor <= lastMonth) {
      buckets.push({
        key: cursor.toFormat(keyFormat),
        label: cursor.toFormat("MMM yy", { locale: "es" }),
      });
      cursor = cursor.plus({ months: 1 });
    }
  } else {
    for (let i = 0; i <= spanDays; i++) {
      const day = start.plus({ days: i });
      buckets.push({
        key: day.toFormat(keyFormat),
        label: day.toFormat("d MMM", { locale: "es" }),
      });
    }
  }

  const values = new Map(buckets.map(({ key }) => [key, 0]));
  const startTime = start.toMillis();
  const endTime = end.toMillis();

  for (const { order, date } of datedOrders) {
    const orderTime = date.toMillis();
    if (orderTime < startTime || orderTime > endTime) continue;

    const key = date.toFormat(keyFormat);
    if (!values.has(key)) continue;

    let value = 0;
    if (mode === "orders") {
      value =
        concreteCategory == null ||
        order.orderItems.some(
          (item) =>
            item.storeCategoryAtPurchase === concreteCategory &&
            item.quantity > 0,
        )
          ? 1
          : 0;
    } else if (order.status === "paid" || order.status === "delivered") {
      value =
        concreteCategory == null
          ? order.totalAmount
          : order.orderItems
              .filter(
                (item) =>
                  item.storeCategoryAtPurchase === concreteCategory &&
                  item.quantity > 0,
              )
              .reduce(
                (sum, item) => sum + item.quantity * item.priceAtPurchase,
                0,
              );
    }

    values.set(key, (values.get(key) ?? 0) + value);
  }

  const data = buckets.map(({ key, label }) => ({
    date: label,
    value: values.get(key) ?? 0,
  }));
  const unbounded = !range.from && !range.to;
  const title =
    unbounded && earliestOrder == null
      ? "Todo el período"
      : `${unbounded ? "Todo el período · " : ""}${formatRange(start, end)}`;

  return { data, title };
}
