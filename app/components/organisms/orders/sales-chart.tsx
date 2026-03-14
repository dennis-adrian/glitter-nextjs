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
import { DateTime } from "luxon";
import { use, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

type SalesChartProps = {
	ordersPromise: Promise<OrderWithRelations[]>;
};

type ChartMode = "revenue" | "orders";

const STORE_ZONE = "America/La_Paz";

const chartConfig = {
	value: {
		label: "Valor",
		color: "hsl(var(--chart-1))",
	},
} satisfies ChartConfig;

export default function OrdersSalesChart({ ordersPromise }: SalesChartProps) {
	const orders = use(ordersPromise);
	const [mode, setMode] = useState<ChartMode>("revenue");

	const chartData = useMemo(() => {
		const now = DateTime.now().setZone(STORE_ZONE);
		const days: { date: string; value: number }[] = [];

		for (let i = 29; i >= 0; i--) {
			const day = now.minus({ days: i });
			const dateKey = day.toFormat("yyyy-MM-dd");
			const label = day.toFormat("d MMM", { locale: "es" });

			const dayOrders = orders.filter((o) => {
				const orderDate = DateTime.fromJSDate(new Date(o.createdAt)).setZone(
					STORE_ZONE,
				);
				return orderDate.toFormat("yyyy-MM-dd") === dateKey;
			});

			const value =
				mode === "revenue"
					? dayOrders
							.filter((o) => o.status === "paid" || o.status === "delivered")
							.reduce((sum, o) => sum + Number(o.totalAmount), 0)
					: dayOrders.length;

			days.push({ date: label, value });
		}

		return days;
	}, [orders, mode]);

	return (
		<Card>
			<CardHeader className="p-4 pb-2">
				<div className="flex items-center justify-between">
					<CardTitle className="text-base">Últimos 30 días</CardTitle>
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
