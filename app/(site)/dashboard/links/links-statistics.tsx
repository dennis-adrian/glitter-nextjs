"use client";

import Link from "next/link";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { Badge } from "@/app/components/ui/badge";
import { buttonVariants } from "@/app/components/ui/button";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/app/components/ui/chart";
import {
  LINKS_SOURCE_LABELS,
  STATS_PERIODS,
  STATS_PERIOD_LABELS,
  formatLinksDay,
  statisticsHref,
  type LinksStatistics as Statistics,
} from "@/app/lib/links/statistics";
import { cn } from "@/app/lib/utils";

const numberFormat = new Intl.NumberFormat("es-BO");
const percentFormat = new Intl.NumberFormat("es-BO", {
  style: "percent",
  maximumFractionDigits: 1,
});
const pointsFormat = new Intl.NumberFormat("es-BO", {
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});
const changeFormat = new Intl.NumberFormat("es-BO", {
  style: "percent",
  maximumFractionDigits: 0,
  signDisplay: "exceptZero",
});

/** A rate, or a dash where there is none: never NaN, never a made-up 0 %. */
function formatRate(rate: number | null) {
  return rate == null ? "—" : percentFormat.format(rate);
}

const chartConfig = {
  views: { label: "Visitas", color: "hsl(var(--chart-1))" },
  taps: { label: "Clics", color: "hsl(var(--chart-2))" },
} satisfies ChartConfig;

function PeriodPicker({ period }: { period: number }) {
  return (
    <nav aria-label="Periodo" className="flex flex-wrap gap-2">
      {STATS_PERIODS.map((option) => (
        <Link
          key={option}
          href={statisticsHref(option)}
          scroll={false}
          aria-current={option === period ? "page" : undefined}
          className={buttonVariants({
            variant: option === period ? "default" : "outline",
            size: "sm",
            wrap: true,
          })}
        >
          {STATS_PERIOD_LABELS[option]}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The line under a total about the period before. Says why there is no
 * comparison rather than showing a rise from nothing.
 */
function ChangeLine({
  change,
  hasPrevious,
  previousIsZero,
  points = false,
}: {
  change: number | null;
  hasPrevious: boolean;
  previousIsZero: boolean;
  points?: boolean;
}) {
  let text: string;
  if (!hasPrevious) text = "Sin periodo anterior completo para comparar";
  else if (change == null) {
    text = previousIsZero
      ? "Sin datos en el periodo anterior"
      : "Sin visitas para comparar";
  } else if (points) {
    text = `${pointsFormat.format(change * 100)} pts vs. periodo anterior`;
  } else {
    text = `${changeFormat.format(change)} vs. periodo anterior`;
  }
  return (
    <p
      className={cn(
        "mt-1 text-xs break-words",
        change != null && change > 0
          ? "text-green-700 dark:text-green-400"
          : change != null && change < 0
            ? "text-red-700 dark:text-red-400"
            : "text-muted-foreground",
      )}
    >
      {text}
    </p>
  );
}

function StatTile({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums break-words">
        {value}
      </p>
      {hint ? (
        <p className="text-xs break-words text-muted-foreground">{hint}</p>
      ) : null}
      {children}
    </div>
  );
}

const thClass = "px-3 py-2 text-left font-medium text-muted-foreground";
const numThClass = cn(thClass, "text-right");
const tdClass = "px-3 py-2 align-top";
const numTdClass = cn(tdClass, "text-right tabular-nums whitespace-nowrap");

/** The statistics of `/links` for one period. */
export default function LinksStatistics({ stats }: { stats: Statistics }) {
  const { totals, previous, change, range, firstDay } = stats;
  const crossesYear = range.from.slice(0, 4) !== range.to.slice(0, 4);
  const periodLine = `Del ${formatLinksDay(range.from, crossesYear)} al ${formatLinksDay(range.to, crossesYear)}, en hora de Bolivia.`;
  const startedLate = firstDay != null && firstDay > range.from;
  const periodIsEmpty = totals.views === 0 && totals.taps === 0;

  return (
    <section aria-labelledby="links-stats-title" className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="links-stats-title" className="text-lg font-semibold">
            Estadísticas
          </h2>
          <p className="text-sm break-words text-muted-foreground">
            {periodLine}
          </p>
        </div>
        <PeriodPicker period={stats.period} />
      </div>

      {firstDay == null ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="font-medium">Todavía no hay datos</p>
          <p className="mt-1 text-sm break-words text-muted-foreground">
            Las visitas a la página y los clics en sus enlaces se cuentan día a
            día desde que se activaron las estadísticas. Aparecerán aquí con la
            primera visita.
          </p>
        </div>
      ) : (
        <>
          {startedLate ? (
            <p className="rounded-md bg-muted px-3 py-2 text-sm break-words">
              Las estadísticas empezaron el{" "}
              {formatLinksDay(firstDay, crossesYear)}; los días anteriores no
              tienen datos.
            </p>
          ) : null}
          {periodIsEmpty ? (
            <p className="rounded-md bg-muted px-3 py-2 text-sm break-words">
              No hubo visitas ni clics en este periodo.
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Visitas" value={numberFormat.format(totals.views)}>
              <ChangeLine
                change={change.views}
                hasPrevious={previous != null}
                previousIsZero={previous?.views === 0}
              />
            </StatTile>
            <StatTile label="Clics" value={numberFormat.format(totals.taps)}>
              <ChangeLine
                change={change.taps}
                hasPrevious={previous != null}
                previousIsZero={previous?.taps === 0}
              />
            </StatTile>
            <StatTile
              label="Tasa de clics"
              value={formatRate(totals.ctr)}
              hint={
                totals.ctr == null
                  ? "Sin visitas en el periodo"
                  : "Clics por cada visita"
              }
            >
              <ChangeLine
                points
                change={change.ctr}
                hasPrevious={previous != null}
                previousIsZero={previous?.views === 0}
              />
            </StatTile>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium">Visitas y clics por día</h3>
            <ChartContainer
              config={chartConfig}
              className="aspect-auto h-64 w-full"
            >
              <LineChart
                data={stats.daily}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                accessibilityLayer
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                  tickFormatter={(day: string) => formatLinksDay(day)}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_, payload) => {
                        const day = payload?.[0]?.payload?.day;
                        return typeof day === "string"
                          ? formatLinksDay(day, true)
                          : "";
                      }}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Line
                  dataKey="views"
                  type="monotone"
                  stroke="var(--color-views)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="taps"
                  type="monotone"
                  stroke="var(--color-taps)"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ChartContainer>
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                Ver los datos por día
              </summary>
              <div className="mt-2 max-h-80 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className={thClass}>Día</th>
                      <th className={numThClass}>Visitas</th>
                      <th className={numThClass}>Clics</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.daily.map((row) => (
                      <tr key={row.day} className="border-b last:border-0">
                        <td className={tdClass}>
                          {formatLinksDay(row.day, true)}
                        </td>
                        <td className={numTdClass}>
                          {numberFormat.format(row.views)}
                        </td>
                        <td className={numTdClass}>
                          {numberFormat.format(row.taps)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium">Por origen</h3>
            <p className="text-xs break-words text-muted-foreground">
              De dónde llegó la visita, según la página que la envió. Directo es
              sin página de origen: escrita a mano, un favorito o una app que no
              la indica.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[22rem] text-sm">
                <thead>
                  <tr className="border-b">
                    <th className={thClass}>Origen</th>
                    <th className={numThClass}>Visitas</th>
                    <th className={numThClass}>Clics</th>
                    <th className={numThClass}>Tasa de clics</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.sources.map((row) => (
                    <tr key={row.source} className="border-b last:border-0">
                      <td className={tdClass}>
                        {LINKS_SOURCE_LABELS[row.source]}
                      </td>
                      <td className={numTdClass}>
                        {numberFormat.format(row.views)}
                      </td>
                      <td className={numTdClass}>
                        {numberFormat.format(row.taps)}
                      </td>
                      <td className={numTdClass}>{formatRate(row.ctr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="space-y-2">
        <h3 className="font-medium">Por enlace</h3>
        <p className="text-xs break-words text-muted-foreground">
          El total histórico se cuenta desde antes de que empezaran las
          estadísticas por día, así que no es la suma de los periodos.
        </p>
        {stats.links.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay enlaces en la página.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <thead>
                <tr className="border-b">
                  <th className={thClass}>Enlace</th>
                  <th className={numThClass}>Clics en el periodo</th>
                  <th className={numThClass}>% de los clics</th>
                  <th className={numThClass}>Total histórico</th>
                </tr>
              </thead>
              <tbody>
                {stats.links.map((row) => (
                  <tr
                    key={row.id ?? "deleted"}
                    className="border-b last:border-0"
                  >
                    <td className={cn(tdClass, "min-w-0")}>
                      <span className="block font-medium break-words">
                        {row.label}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {row.kind === "social" ? (
                          <Badge variant="outline">Red social</Badge>
                        ) : null}
                        {row.hidden && row.id != null ? (
                          <Badge variant="outline">Oculto</Badge>
                        ) : null}
                      </span>
                    </td>
                    <td className={numTdClass}>
                      {numberFormat.format(row.taps)}
                    </td>
                    <td className={numTdClass}>{formatRate(row.share)}</td>
                    <td className={numTdClass}>
                      {row.lifetime == null
                        ? "—"
                        : numberFormat.format(row.lifetime)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
