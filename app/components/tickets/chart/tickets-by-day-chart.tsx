"use client";

import { PieChart, Pie, Cell } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
} from "@/components/ui/chart";
import { TicketWithVisitor } from "@/app/data/tickets/actions";
import { formatDate } from "@/app/lib/formatters";

type TicketsByDayChartProps = {
  tickets: TicketWithVisitor[];
  festivalDates: { startDate: Date }[];
};

export default function TicketsByDayChart({
  tickets,
  festivalDates,
}: TicketsByDayChartProps) {
  if (festivalDates.length < 2) return null;

  const day1Date = formatDate(festivalDates[0].startDate).toISODate();
  const day2Date = formatDate(festivalDates[1].startDate).toISODate();

  let day1Visitors = 0;
  let day2Visitors = 0;

  for (const ticket of tickets) {
    const ticketDate = formatDate(ticket.date).toISODate();
    if (ticketDate === day1Date) {
      day1Visitors += ticket.numberOfVisitors;
    } else if (ticketDate === day2Date) {
      day2Visitors += ticket.numberOfVisitors;
    }
  }

  const chartConfig: ChartConfig = {
    day1: { label: "Día 1", color: "#2563eb" },
    day2: { label: "Día 2", color: "#16a34a" },
  };

  const chartData = [
    { name: "day1", value: day1Visitors },
    { name: "day2", value: day2Visitors },
  ];

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">
        Entradas por día
      </h2>
      <ChartContainer config={chartConfig} className="min-h-[200px] w-full">
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={80}
          >
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={`var(--color-${entry.name})`} />
            ))}
          </Pie>
          <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
          <ChartLegend
            content={({ payload }) => (
              <ul className="flex justify-center gap-4 text-sm">
                {payload?.map((entry) => (
                  <li key={entry.value} className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span>
                      {chartConfig[entry.value as keyof typeof chartConfig]
                        ?.label ?? entry.value}
                      {": "}
                      {
                        chartData.find((d) => d.name === entry.value)
                          ?.value
                      }
                    </span>
                  </li>
                ))}
              </ul>
            )}
          />
        </PieChart>
      </ChartContainer>
    </div>
  );
}
