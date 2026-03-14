"use client";

import { OrderStatus } from "@/app/lib/orders/definitions";
import {
	CardContent,
	Card,
	CardHeader,
	CardTitle,
} from "@/app/components/ui/card";
import { PackageIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import QuickStatusIndicators from "@/app/components/organisms/orders/order_totals_card/quick-status-indicators";
import StatusPercentage from "@/app/components/organisms/orders/order_totals_card/status-percentage";
import { calculatePercentage } from "@/app/components/organisms/orders/order_totals_card/utils";

type OrderTotalsCardProps = {
	product: {
		totals: Partial<Record<OrderStatus, number>>;
		allTotalsSum: number;
		productName: string;
	};
};

export default function OrderTotalsCard({ product }: OrderTotalsCardProps) {
	const [isExpanded, setIsExpanded] = useState(false);

	return (
		<Card className="w-full transition-all duration-300 hover:shadow-md">
			<CardHeader className="pb-4">
				<div className="flex items-start gap-3">
					<PackageIcon className="h-6 w-6 text-muted-foreground mt-1 shrink-0" />
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
						isExpanded ? "max-h-[32rem] opacity-100" : "max-h-0 opacity-0"
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

						{product.totals.pending && product.totals.pending > 0 && (
							<StatusPercentage
								status="pending"
								percentage={calculatePercentage(product.totals.pending, product.allTotalsSum)}
								total={product.totals.pending}
							/>
						)}

						{product.totals.payment_verification && product.totals.payment_verification > 0 && (
							<StatusPercentage
								status="payment_verification"
								percentage={calculatePercentage(product.totals.payment_verification, product.allTotalsSum)}
								total={product.totals.payment_verification}
							/>
						)}

						{product.totals.processing && product.totals.processing > 0 && (
							<StatusPercentage
								status="processing"
								percentage={calculatePercentage(product.totals.processing, product.allTotalsSum)}
								total={product.totals.processing}
							/>
						)}

						{product.totals.paid && product.totals.paid > 0 && (
							<StatusPercentage
								status="paid"
								percentage={calculatePercentage(product.totals.paid, product.allTotalsSum)}
								total={product.totals.paid}
							/>
						)}

						{product.totals.delivered && product.totals.delivered > 0 && (
							<StatusPercentage
								status="delivered"
								percentage={calculatePercentage(product.totals.delivered, product.allTotalsSum)}
								total={product.totals.delivered}
							/>
						)}

						{product.totals.cancelled && product.totals.cancelled > 0 && (
							<StatusPercentage
								status="cancelled"
								percentage={calculatePercentage(product.totals.cancelled, product.allTotalsSum)}
								total={product.totals.cancelled}
							/>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
