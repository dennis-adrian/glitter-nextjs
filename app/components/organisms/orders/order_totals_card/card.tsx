"use client";

import { Badge } from "@/app/components/ui/badge";
import { OrderStatus } from "@/app/lib/orders/definitions";
import {
	CardContent,
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/components/ui/card";
import {
	AlertCircleIcon,
	CheckCircleIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	ClockIcon,
	PackageIcon,
} from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Progress } from "@/app/components/ui/progress";
import { getStatusColor } from "@/app/components/organisms/orders/order_totals_card/utils";
import QuickStatusIndicators from "@/app/components/organisms/orders/order_totals_card/quick-status-indicators";
import StatusPercentage from "@/app/components/organisms/orders/order_totals_card/status-percentage";

type OrderTotalsCardProps = {
	product: {
		totals: Record<OrderStatus, number>;
		allTotalsSum: number;
		productName: string;
	};
};

export default function OrderTotalsCard({ product }: OrderTotalsCardProps) {
	const [isExpanded, setIsExpanded] = useState(false);

	const paidPercentage = (product.totals.paid / product.allTotalsSum) * 100;
	const pendingPercentage =
		(product.totals.pending / product.allTotalsSum) * 100;
	const processingPercentage =
		(product.totals.processing / product.allTotalsSum) * 100;
	const deliveredPercentage =
		(product.totals.delivered / product.allTotalsSum) * 100;
	const cancelledPercentage =
		(product.totals.cancelled / product.allTotalsSum) * 100;

	return (
		<Card className="w-full max-w-md transition-all duration-300 hover:shadow-md my-2">
			<CardHeader className="pb-4">
				<div className="flex items-start gap-3">
					<PackageIcon className="h-6 w-6 text-muted-foreground mt-1 flex-shrink-0" />
					<div className="flex-1 min-w-0">
						<CardTitle className="text-lg leading-tight">
							{product.productName}
						</CardTitle>
					</div>
				</div>
			</CardHeader>

			<CardContent className="space-y-4">
				{/* Overview - Always visible */}
				<div
					className="flex items-center justify-between p-4 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted/70 transition-colors"
					onClick={() => setIsExpanded(!isExpanded)}
				>
					<div>
						<div className="text-2xl font-bold text-muted-foreground">
							{product.allTotalsSum}
						</div>
						<div className="text-sm text-muted-foreground">Pedidos totales</div>
					</div>

					<QuickStatusIndicators product={product} isExpanded={isExpanded} />
				</div>

				{/* Expanded Details */}
				<div
					className={`transition-all duration-300 overflow-hidden ${
						isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
					}`}
				>
					<div className="space-y-4 pt-2">
						<div className="flex items-center justify-between">
							<h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
								Estado de pedidos
							</h4>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setIsExpanded(false)}
								className="h-6 px-2 text-xs"
							>
								Contraer
							</Button>
						</div>

						{/* Por confirmar */}
						{product.totals.pending > 0 && (
							<StatusPercentage
								status="pending"
								percentage={pendingPercentage}
								total={product.totals.pending}
							/>
						)}

						{/* En proceso */}
						{product.totals.processing > 0 && (
							<StatusPercentage
								status="processing"
								percentage={processingPercentage}
								total={product.totals.processing}
							/>
						)}

						{/* Pagado */}
						{product.totals.paid > 0 && (
							<StatusPercentage
								status="paid"
								percentage={paidPercentage}
								total={product.totals.paid}
							/>
						)}

						{/* Entregado */}
						{product.totals.delivered > 0 && (
							<StatusPercentage
								status="delivered"
								percentage={deliveredPercentage}
								total={product.totals.delivered}
							/>
						)}

						{/* Cancelado */}
						{product.totals.cancelled > 0 && (
							<StatusPercentage
								status="cancelled"
								percentage={cancelledPercentage}
								total={product.totals.cancelled}
							/>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
