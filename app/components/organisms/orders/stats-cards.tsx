"use client";

import { Card, CardContent } from "@/app/components/ui/card";
import { OrdersStats, OrdersStatsComparison } from "@/app/lib/orders/actions";
import { formatDate } from "@/app/lib/formatters";
import {
  storeCategoryScopeHref,
  type StoreCategoryScope,
} from "@/app/lib/store/category";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { use } from "react";

type MetricKey = keyof OrdersStats;

type Metric = {
  key: MetricKey;
  label: string;
  money?: boolean;
  /** Whether a rise is good news, which decides the delta's colour. */
  higherIsBetter: boolean;
  accent?: boolean;
};

const METRICS: Metric[] = [
  { key: "totalOrders", label: "Pedidos totales", higherIsBetter: true },
  {
    key: "totalRevenue",
    label: "Ingresos confirmados",
    money: true,
    higherIsBetter: true,
  },
  {
    key: "needsAttention",
    label: "Requieren atención",
    higherIsBetter: false,
    accent: true,
  },
  { key: "inProgress", label: "En proceso", higherIsBetter: true },
  { key: "delivered", label: "Entregados", higherIsBetter: true },
  { key: "cancelled", label: "Cancelados", higherIsBetter: false },
];

function formatValue(value: number, money?: boolean) {
  return money ? `Bs ${value.toFixed(2)}` : String(value);
}

function formatBaseline(baseline: { from: Date; to: Date }) {
  const from = formatDate(baseline.from);
  const to = formatDate(baseline.to);
  if (from.hasSame(to, "month")) {
    return `vs ${from.day}–${to.toLocaleString({
      day: "numeric",
      month: "short",
    })}`;
  }
  // Without the year, a window crossing December reads as a backwards range.
  const format: Intl.DateTimeFormatOptions = from.hasSame(to, "year")
    ? { day: "numeric", month: "short" }
    : { day: "numeric", month: "short", year: "2-digit" };
  return `vs ${from.toLocaleString(format)} – ${to.toLocaleString(format)}`;
}

function Delta({
  current,
  previous,
  higherIsBetter,
  money,
}: {
  current: number;
  previous: number;
  higherIsBetter: boolean;
  money?: boolean;
}) {
  const diff = current - previous;
  if (diff === 0) {
    return <span className="text-xs text-muted-foreground">Sin cambio</span>;
  }

  const rising = diff > 0;
  const good = rising === higherIsBetter;
  const Icon = rising ? TrendingUpIcon : TrendingDownIcon;
  // A percentage against zero is meaningless, so show the movement itself.
  const magnitude =
    previous === 0
      ? `${rising ? "+" : ""}${formatValue(diff, money)}`
      : `${rising ? "+" : "−"}${Math.abs((diff / previous) * 100).toFixed(1)}%`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-semibold tabular-nums",
        good ? "text-green-700" : "text-red-600",
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {magnitude}
    </span>
  );
}

type OrdersStatsCardsProps = {
  statsPromise: Promise<OrdersStatsComparison>;
  category: StoreCategoryScope;
};

export default function OrdersStatsCards({
  statsPromise,
  category,
}: OrdersStatsCardsProps) {
  const { current, previous, baseline } = use(statsPromise);
  // The KPI link keeps the active scope while carrying its own status filter.
  const needsAttentionHref = `${storeCategoryScopeHref(
    "/dashboard/store/orders",
    category,
  )}${category === "all" ? "?" : "&"}status=needs_attention`;
  const baselineLabel = baseline ? formatBaseline(baseline) : null;

  return (
    // A snap rail on phones keeps six metrics in one band instead of three
    // stacked rows; the grid takes over once there is width for it.
    <div
      className={cn(
        "-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-1",
        "[&::-webkit-scrollbar]:hidden",
        "md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0",
      )}
    >
      {METRICS.map((metric) => {
        const value = current[metric.key];
        const card = (
          <Card
            className={cn(
              "h-full",
              metric.accent && value > 0 && "border-amber-300",
            )}
          >
            <CardContent className="flex flex-col gap-0.5 p-3">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {metric.label}
              </span>
              <p
                className={cn(
                  "font-space-grotesk text-2xl font-semibold tabular-nums leading-tight",
                  metric.accent && value > 0 && "text-amber-600",
                )}
              >
                {formatValue(value, metric.money)}
              </p>
              {previous && (
                <Delta
                  current={value}
                  previous={previous[metric.key]}
                  higherIsBetter={metric.higherIsBetter}
                  money={metric.money}
                />
              )}
              {baselineLabel && (
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {baselineLabel}
                </span>
              )}
            </CardContent>
          </Card>
        );

        const href =
          metric.key === "needsAttention" ? needsAttentionHref : null;

        return (
          <div
            key={metric.key}
            className="w-40 shrink-0 snap-start md:w-auto md:shrink"
          >
            {href ? (
              <Link href={href} className="block h-full">
                {card}
              </Link>
            ) : (
              card
            )}
          </div>
        );
      })}
    </div>
  );
}
