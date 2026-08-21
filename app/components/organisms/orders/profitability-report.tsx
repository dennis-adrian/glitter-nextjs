"use client";

import { Button } from "@/app/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/app/components/ui/alert-dialog";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/app/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import OrdersDateFilter from "@/app/components/organisms/orders/orders-date-filter";
import { formatDate } from "@/app/lib/formatters";
import {
  applyHistoricalOrderCosts,
  type HistoricalCostBackfillPreview,
  type OrdersProfitability,
} from "@/app/lib/orders/actions";
import {
  profitabilityQueryToSearchParams,
  type ProfitabilityQuery,
} from "@/app/lib/orders/profitability-query-schema";
import {
  DownloadIcon,
  HistoryIcon,
  Loader2Icon,
  TrendingUpIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useState, useTransition } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import {
  getStoreCategoryBadgeLabel,
  type StoreCategory,
} from "@/app/lib/store/category";
import { captureClientEvent } from "@/app/lib/posthog-capture";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";

const money = new Intl.NumberFormat("es-BO", {
  style: "currency",
  currency: "BOB",
});

const chartConfig = {
  revenue: { label: "Ingresos", color: "hsl(var(--chart-1))" },
  cost: { label: "Costo conocido", color: "hsl(var(--chart-4))" },
  profit: { label: "Ganancia bruta", color: "hsl(var(--chart-2))" },
} satisfies ChartConfig;

export default function ProfitabilityReport({
  reportPromise,
  historicalCostPreviewPromise,
  query,
}: {
  reportPromise: Promise<OrdersProfitability>;
  /** Null under a concrete scope: cost completion stays a global action. */
  historicalCostPreviewPromise: Promise<HistoricalCostBackfillPreview> | null;
  query: ProfitabilityQuery;
}) {
  const report = use(reportPromise);
  const preview = historicalCostPreviewPromise
    ? use(historicalCostPreviewPromise)
    : null;
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const coverage =
    report.grossRevenue === 0
      ? 0
      : (report.knownCostRevenue / report.grossRevenue) * 100;
  const grossMargin =
    report.knownCostRevenue === 0
      ? null
      : (report.grossProfit / report.knownCostRevenue) * 100;
  const orderCount = new Set(report.rows.map((row) => row.orderId)).size;
  const units = report.rows.reduce((sum, row) => sum + row.quantity, 0);
  const averageOrderValue =
    orderCount === 0 ? null : report.grossRevenue / orderCount;
  const trend = useMemo(() => buildTrend(report.rows), [report.rows]);
  const breakdown = useMemo(() => buildBreakdown(report.rows), [report.rows]);
  const exportHref = `/api/store/reports/profitability/export?${profitabilityQueryToSearchParams(query)}`;

  useEffect(() => {
    captureClientEvent(POSTHOG_EVENTS.STORE_PROFITABILITY_REPORT_VIEWED, {
      period: query.period,
      category: query.category,
      has_custom_range: Boolean(query.from || query.to),
      coverage_band:
        coverage >= 100 ? "complete" : coverage >= 75 ? "high" : "low",
    });
  }, [coverage, query.category, query.from, query.period, query.to]);

  function updateQuery(next: ProfitabilityQuery) {
    startTransition(() => {
      router.replace(
        `/dashboard/store/analytics?${profitabilityQueryToSearchParams(next)}`,
        { scroll: false },
      );
    });
  }

  function applyHistoricalCosts() {
    startTransition(async () => {
      const result = await applyHistoricalOrderCosts();
      if (result.success) {
        toast.success(result.message);
        setConfirmOpen(false);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <section className="space-y-5 rounded-xl border bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUpIcon className="h-4 w-4 text-primary" />
            <h3 className="text-lg font-semibold">Rentabilidad de pedidos</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Compras pagadas y entregadas; los alquileres no se incluyen.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={exportHref}>
            <DownloadIcon className="mr-2 h-4 w-4" />
            Exportar CSV
          </a>
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 lg:flex-row lg:items-center lg:justify-between">
        <OrdersDateFilter
          period={query.period}
          dateFrom={query.from ?? ""}
          dateTo={query.to ?? ""}
          hasCustomRange={query.period === "custom"}
          onPeriodChange={(period) =>
            updateQuery({ ...query, period, from: undefined, to: undefined })
          }
          onFromChange={(from) =>
            updateQuery({ ...query, period: "custom", from: from || undefined })
          }
          onToChange={(to) =>
            updateQuery({ ...query, period: "custom", to: to || undefined })
          }
        />
        {isPending && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
            Actualizando
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Ingresos confirmados"
          value={money.format(report.grossRevenue)}
        />
        <Metric
          label="Costo conocido"
          value={money.format(report.productCost)}
        />
        <Metric
          label="Ganancia bruta"
          value={money.format(report.grossProfit)}
          tone={report.grossProfit >= 0 ? "text-emerald-600" : "text-red-600"}
        />
        <Metric
          label="Margen bruto"
          value={grossMargin == null ? "—" : `${grossMargin.toFixed(1)}%`}
        />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-y py-3 text-sm lg:grid-cols-4">
        <SecondaryMetric label="Pedidos confirmados" value={orderCount} />
        <SecondaryMetric label="Unidades vendidas" value={units} />
        <SecondaryMetric
          label="Ticket promedio"
          value={
            averageOrderValue == null ? "—" : money.format(averageOrderValue)
          }
        />
        <SecondaryMetric
          label="Cobertura de costos"
          value={`${coverage.toFixed(1)}%`}
        />
      </div>

      {report.lineCount > 0 && (
        <div className="space-y-2 rounded-lg border border-amber-200/80 bg-amber-50/60 p-3">
          <div className="flex items-center justify-between gap-3 text-xs">
            <p className="font-medium text-amber-950">
              {coverage < 100
                ? `Rentabilidad parcial: ${coverage.toFixed(1)}% de los ingresos tiene costo registrado.`
                : "Todos los ingresos tienen costo registrado."}
            </p>
            <span className="shrink-0 font-semibold tabular-nums text-amber-800">
              {money.format(report.knownCostRevenue)} cubiertos
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-amber-200/70">
            <div
              className="h-full rounded-full bg-amber-500 transition-[width]"
              style={{ width: `${Math.min(100, coverage)}%` }}
            />
          </div>
        </div>
      )}

      {report.rows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm font-medium">No hay ventas confirmadas</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Prueba otro período para ver la rentabilidad.
          </p>
        </div>
      ) : (
        <>
          <ProfitabilityTrend data={trend} />
          <ProfitabilityBreakdown rows={breakdown} />
        </>
      )}

      {preview != null && preview.missingLines > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <HistoryIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Completar costos históricos</p>
              <p className="text-xs text-amber-800">
                {preview.resolvableLines} de {preview.missingLines} artículos
                pueden usar los costos actuales · {preview.affectedOrders}{" "}
                pedidos
              </p>
              {preview.unresolvedLines > 0 && (
                <p className="text-xs text-amber-700">
                  {preview.unresolvedLines} artículos seguirán pendientes hasta
                  que agregues su costo de producto o variante.
                </p>
              )}
            </div>
          </div>

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={preview.resolvableLines === 0 || isPending}
                className="shrink-0 border-amber-300 bg-white hover:bg-amber-100"
              >
                Aplicar costos actuales
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  ¿Aplicar costos a todos los pedidos?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Se copiará el costo actual del producto o variante a{" "}
                  {preview.resolvableLines} artículos de pedidos históricos.
                  Solo se completan costos vacíos; los costos ya guardados no
                  cambian.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Pedidos afectados</p>
                  <p className="font-semibold">{preview.affectedOrders}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Costo estimado</p>
                  <p className="font-semibold">
                    {money.format(preview.estimatedCost)}
                  </p>
                </div>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isPending}>
                  Cancelar
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={isPending}
                  onClick={(event) => {
                    event.preventDefault();
                    applyHistoricalCosts();
                  }}
                >
                  {isPending && (
                    <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Aplicar a todos
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

function SecondaryMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold tabular-nums">{value}</p>
    </div>
  );
}

type TrendPoint = {
  key: string;
  date: string;
  revenue: number;
  cost: number;
  profit: number;
};

function buildTrend(rows: OrdersProfitability["rows"]): TrendPoint[] {
  const days = new Map<string, TrendPoint>();

  for (const row of rows) {
    const date = formatDate(row.date);
    const key = date.toISODate();
    if (!key) continue;
    const point = days.get(key) ?? {
      key,
      date: date.toFormat("d LLL"),
      revenue: 0,
      cost: 0,
      profit: 0,
    };
    point.revenue += row.revenue;
    point.cost += row.cost ?? 0;
    point.profit += row.profit ?? 0;
    days.set(key, point);
  }

  return Array.from(days.values()).sort((a, b) => a.key.localeCompare(b.key));
}

type BreakdownRow = {
  key: string;
  product: string;
  storeCategory: StoreCategory;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
  knownCostRevenue: number;
  coverage: number;
  margin: number | null;
};

function buildBreakdown(rows: OrdersProfitability["rows"]): BreakdownRow[] {
  const products = new Map<string, Omit<BreakdownRow, "coverage" | "margin">>();

  for (const row of rows) {
    // Same-named products in different categories are different lines of
    // business and must not merge into one row.
    const key = `${row.storeCategory}:${row.product}`;
    const current = products.get(key) ?? {
      key,
      product: row.product,
      storeCategory: row.storeCategory,
      units: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
      knownCostRevenue: 0,
    };
    current.units += row.quantity;
    current.revenue += row.revenue;
    current.cost += row.cost ?? 0;
    current.profit += row.profit ?? 0;
    current.knownCostRevenue += row.cost == null ? 0 : row.revenue;
    products.set(key, current);
  }

  return Array.from(products.values())
    .map((row) => ({
      ...row,
      coverage:
        row.revenue === 0 ? 0 : (row.knownCostRevenue / row.revenue) * 100,
      margin:
        row.knownCostRevenue === 0
          ? null
          : (row.profit / row.knownCostRevenue) * 100,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

function ProfitabilityTrend({ data }: { data: TrendPoint[] }) {
  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold">Evolución del período</h4>
        <p className="text-xs text-muted-foreground">
          Ingresos, costo conocido y ganancia bruta por día con ventas.
        </p>
      </div>
      <ChartContainer config={chartConfig} className="h-64 w-full">
        <AreaChart data={data} margin={{ left: 4, right: 4 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={24}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={54}
            tickFormatter={(value) =>
              `Bs ${Number(value).toLocaleString("es-BO")}`
            }
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name) => (
                  <div className="flex min-w-40 items-center justify-between gap-3">
                    <span className="text-muted-foreground">
                      {chartConfig[name as keyof typeof chartConfig]?.label ??
                        name}
                    </span>
                    <span className="font-mono font-medium">
                      {money.format(Number(value))}
                    </span>
                  </div>
                )}
              />
            }
          />
          <Area
            dataKey="revenue"
            type="monotone"
            fill="var(--color-revenue)"
            fillOpacity={0.1}
            stroke="var(--color-revenue)"
            strokeWidth={2}
          />
          <Area
            dataKey="cost"
            type="monotone"
            fill="transparent"
            stroke="var(--color-cost)"
            strokeWidth={2}
          />
          <Area
            dataKey="profit"
            type="monotone"
            fill="transparent"
            stroke="var(--color-profit)"
            strokeWidth={2}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

function ProfitabilityBreakdown({ rows }: { rows: BreakdownRow[] }) {
  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold">Productos y variantes</h4>
        <p className="text-xs text-muted-foreground">
          Ordenado por ingresos confirmados.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-56">Producto / variante</TableHead>
              <TableHead className="text-right">Unidades</TableHead>
              <TableHead className="text-right">Ingresos</TableHead>
              <TableHead className="text-right">Costo conocido</TableHead>
              <TableHead className="text-right">Ganancia</TableHead>
              <TableHead className="text-right">Margen</TableHead>
              <TableHead className="text-right">Cobertura</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="font-medium">
                  {row.product}
                  <span className="ml-2 rounded-full border px-2 py-0.5 text-xs font-normal text-muted-foreground">
                    {getStoreCategoryBadgeLabel(row.storeCategory)}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.units}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money.format(row.revenue)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.knownCostRevenue === 0 ? "—" : money.format(row.cost)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.knownCostRevenue === 0 ? "—" : money.format(row.profit)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.margin == null ? "—" : `${row.margin.toFixed(1)}%`}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <span
                    className={
                      row.coverage < 100 ? "text-amber-700" : "text-emerald-700"
                    }
                  >
                    {row.coverage.toFixed(0)}%
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
