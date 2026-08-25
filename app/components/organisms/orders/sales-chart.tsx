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
import {
  buildSalesChartData,
  type SalesChartMode,
} from "@/app/components/organisms/orders/sales-chart-data";
import { OrderWithRelations } from "@/app/lib/orders/definitions";
import { type StoreCategoryScope } from "@/app/lib/store/category";
import { use, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

type SalesChartProps = {
  ordersPromise: Promise<OrderWithRelations[]>;
  category: StoreCategoryScope;
  /** The page-level window shared by every historical analytics section. */
  range: { from?: Date; to?: Date };
};

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
  const [mode, setMode] = useState<SalesChartMode>("revenue");
  // Dates cross the server boundary as fresh objects each render, so the
  // memos key off their timestamps instead of identity.
  const fromTime = range.from?.getTime() ?? null;
  const toTime = range.to?.getTime() ?? null;
  const { data: chartData, title } = useMemo(
    () =>
      buildSalesChartData({
        orders,
        category,
        mode,
        range: {
          from: fromTime == null ? undefined : new Date(fromTime),
          to: toTime == null ? undefined : new Date(toTime),
        },
      }),
    [category, fromTime, mode, orders, toTime],
  );

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
