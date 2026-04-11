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
import { TicketIcon } from "lucide-react";
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
	const totalCheckIns = chartData.reduce(
		(sum, d) => sum + d.day1 + (d.day2 ?? 0),
		0,
	);

	return (
		<div className="space-y-2">
			<div className="flex items-baseline justify-between">
				<h2 className="text-sm font-medium text-muted-foreground">
					Distribución de check-ins por hora
				</h2>
				{chartData.length > 0 && (
					<span className="text-sm font-medium">
						Total: {totalCheckIns.toLocaleString()}
					</span>
				)}
			</div>
			{chartData.length === 0 ? (
				<div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-muted-foreground">
					<TicketIcon className="h-10 w-10 opacity-30" />
					<p className="text-sm">No hay check-ins registrados aún</p>
				</div>
			) : (
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
			)}
		</div>
	);
}
