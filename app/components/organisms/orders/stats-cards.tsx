"use client";

import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/components/ui/card";
import { OrdersStats } from "@/app/lib/orders/actions";
import {
	AlertTriangleIcon,
	BanIcon,
	CogIcon,
	CoinsIcon,
	ShoppingBagIcon,
	TruckIcon,
} from "lucide-react";
import { use } from "react";

type OrdersStatsCardsProps = {
	statsPromise: Promise<OrdersStats>;
};

export default function OrdersStatsCards({
	statsPromise,
}: OrdersStatsCardsProps) {
	const stats = use(statsPromise);

	const cards = [
		{
			label: "Pedidos totales",
			value: stats.totalOrders,
			icon: ShoppingBagIcon,
			accent: false,
		},
		{
			label: "Ingresos confirmados",
			value: `Bs ${stats.totalRevenue.toFixed(2)}`,
			icon: CoinsIcon,
			accent: false,
		},
		{
			label: "Requieren atención",
			value: stats.needsAttention,
			icon: AlertTriangleIcon,
			accent: stats.needsAttention > 0,
		},
		{
			label: "En proceso",
			value: stats.inProgress,
			icon: CogIcon,
			accent: false,
		},
		{
			label: "Entregados",
			value: stats.delivered,
			icon: TruckIcon,
			accent: false,
		},
		{
			label: "Cancelados",
			value: stats.cancelled,
			icon: BanIcon,
			accent: false,
		},
	];

	return (
		<div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
			{cards.map((card) => {
				const Icon = card.icon;
				return (
					<Card
						key={card.label}
						className={card.accent ? "border-amber-200" : undefined}
					>
						<CardHeader className="p-4 pb-2">
							<div className="flex items-center gap-2">
								<Icon
									className={`h-4 w-4 ${card.accent ? "text-amber-600" : "text-muted-foreground"}`}
								/>
								<CardTitle className="text-xs font-medium text-muted-foreground">
									{card.label}
								</CardTitle>
							</div>
						</CardHeader>
						<CardContent className="p-4 pt-0">
							<p
								className={`text-2xl font-bold ${card.accent ? "text-amber-600" : ""}`}
							>
								{card.value}
							</p>
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
}
