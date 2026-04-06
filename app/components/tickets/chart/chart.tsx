"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import { TicketWithVisitor } from "@/app/data/tickets/actions";
import { generateChartData } from "@/app/components/tickets/chart/helpers";

const chartConfig = {
  day1: {
    label: "Día 1",
    color: "#2563eb",
  },
  day2: {
    label: "Día 2",
    color: "#16a34a",
  },
} satisfies ChartConfig;

type TicketsChartProps = {
  tickets: TicketWithVisitor[];
  festivalDates: { startDate: Date }[];
};

export default function TicketsChart(props: TicketsChartProps) {
  const chartData = generateChartData(props.tickets, props.festivalDates);
  const isMultiDay = props.festivalDates.length > 1;

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">
        Distribución de check-ins por hora
      </h2>
      <ChartContainer config={chartConfig} className="min-h-[200px] w-full">
        <BarChart data={chartData}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="hour"
            tickLine={false}
            tickMargin={10}
            axisLine={false}
          />
          <YAxis tickLine={false} axisLine={false} width={32} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {isMultiDay && <ChartLegend content={<ChartLegendContent />} />}
          <Bar dataKey="day1" fill="var(--color-day1)" radius={4} />
          {isMultiDay && (
            <Bar dataKey="day2" fill="var(--color-day2)" radius={4} />
          )}
        </BarChart>
      </ChartContainer>
    </div>
  );
}
