"use client";

import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/app/components/ui/chart";
import { OrderWithRelations } from "@/app/lib/orders/definitions";
import {
  toConcreteStoreCategory,
  type StoreCategoryScope,
} from "@/app/lib/store/category";
import { DateTime } from "luxon";
import { use, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

type SalesChartProps = {
  ordersPromise: Promise<OrderWithRelations[]>;
  category: StoreCategoryScope;
  /** The page-level window. Unbounded falls back to the last 30 days. */
  range: { from?: Date; to?: Date };
};

type ChartMode = "revenue" | "orders";

const STORE_ZONE = "America/La_Paz";

const chartConfig = {
  value: {
    label: "Valor",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

export default function OrdersSalesChart({
  ordersPromise,
  category,
  range,
}: SalesChartProps) {
  const orders = use(ordersPromise);
  const [mode, setMode] = useState<ChartMode>("revenue");
  const concreteCategory = toConcreteStoreCategory(category);
  // Dates cross the server boundary as fresh objects each render, so the
  // memos key off their timestamps instead of identity.
  const fromTime = range.from?.getTime() ?? null;
  const toTime = range.to?.getTime() ?? null;

  const { buckets, keyFormat, start, end } = useMemo(() => {
    const now = DateTime.now().setZone(STORE_ZONE);
    const end =
      toTime == null ? now : DateTime.fromMillis(toTime).setZone(STORE_ZONE);
    const start =
      fromTime == null
        ? end.minus({ days: 29 })
        : DateTime.fromMillis(fromTime).setZone(STORE_ZONE);
    const spanDays = Math.max(
      0,
      Math.floor(end.startOf("day").diff(start.startOf("day"), "days").days),
    );

    // A year of daily points is unreadable, so long windows roll up by month.
    if (spanDays > 92) {
      const months: { key: string; label: string }[] = [];
      let cursor = start.startOf("month");
      const lastMonth = end.startOf("month");
      while (cursor <= lastMonth) {
        months.push({
          key: cursor.toFormat("yyyy-MM"),
          label: cursor.toFormat("MMM yy", { locale: "es" }),
        });
        cursor = cursor.plus({ months: 1 });
      }
      return { buckets: months, keyFormat: "yyyy-MM", start, end };
    }

    const days: { key: string; label: string }[] = [];
    for (let i = 0; i <= spanDays; i++) {
      const day = start.plus({ days: i });
      days.push({
        key: day.toFormat("yyyy-MM-dd"),
        label: day.toFormat("d MMM", { locale: "es" }),
      });
    }
    return { buckets: days, keyFormat: "yyyy-MM-dd", start, end };
  }, [fromTime, toTime]);

  const chartData = useMemo(() => {
    return buckets.map(({ key, label }) => {
      const dayOrders = orders.filter((o) => {
        const orderDate = DateTime.fromJSDate(new Date(o.createdAt)).setZone(
          STORE_ZONE,
        );
        return orderDate.toFormat(keyFormat) === key;
      });

      // A mixed order's whole total belongs to no single category, so a
      // concrete scope sums matching lines instead.
      const value =
        mode === "revenue"
          ? dayOrders
              .filter((o) => o.status === "paid" || o.status === "delivered")
              .reduce(
                (sum, o) =>
                  sum +
                  (concreteCategory == null
                    ? o.totalAmount
                    : o.orderItems
                        .filter(
                          (item) =>
                            item.storeCategoryAtPurchase === concreteCategory,
                        )
                        .reduce(
                          (lineSum, item) =>
                            lineSum + item.quantity * item.priceAtPurchase,
                          0,
                        )),
                0,
              )
          : concreteCategory == null
            ? dayOrders.length
            : dayOrders.filter((o) =>
                o.orderItems.some(
                  (item) =>
                    item.storeCategoryAtPurchase === concreteCategory &&
                    item.quantity > 0,
                ),
              ).length;

      return { date: label, value };
    });
  }, [orders, mode, concreteCategory, buckets, keyFormat]);

  const title = useMemo(() => {
    // Both bounds missing is period === "all"; a one-sided custom window
    // still has a resolved start/end from the bucket memo.
    if (fromTime == null && toTime == null) return "Últimos 30 días";
    // Show the start's year too when the window crosses one.
    const startFormat = start.hasSame(end, "year") ? "d MMM" : "d MMM yyyy";
    return `${start.toFormat(startFormat, { locale: "es" })} – ${end.toFormat(
      "d MMM yyyy",
      { locale: "es" },
    )}`;
  }, [fromTime, toTime, start, end]);

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={mode === "revenue" ? "default" : "ghost"}
              onClick={() => setMode("revenue")}
            >
              Ingresos
            </Button>
            <Button
              size="sm"
              variant={mode === "orders" ? "default" : "ghost"}
              onClick={() => setMode("orders")}
            >
              Pedidos
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <ChartContainer config={chartConfig} className="h-56 w-full">
          <AreaChart data={chartData}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval={4}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(v) => (mode === "revenue" ? `Bs${v}` : String(v))}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) =>
                    mode === "revenue"
                      ? `Bs ${Number(value).toFixed(2)}`
                      : String(value)
                  }
                />
              }
            />
            <Area
              dataKey="value"
              type="monotone"
              fill="hsl(var(--chart-1) / 0.2)"
              stroke="hsl(var(--chart-1))"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
