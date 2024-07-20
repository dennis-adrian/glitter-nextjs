"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
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
  tickets: {
    label: "Entradas",
    color: "#2563eb",
  },
} satisfies ChartConfig;

type TicketsChartProps = {
  tickets: TicketWithVisitor[];
};

export default function TicketsChart(props: TicketsChartProps) {
  const chartData = generateChartData(props.tickets);
  return (
    <ChartContainer config={chartConfig} className="min-h-[200px] w-full">
      <BarChart accessibilityLayer data={chartData}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          tickMargin={10}
          axisLine={false}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="tickets" fill="var(--color-tickets)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
