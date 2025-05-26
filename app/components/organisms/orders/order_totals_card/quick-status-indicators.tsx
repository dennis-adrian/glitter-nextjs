import { getStatusColor } from "@/app/components/organisms/orders/order_totals_card/utils";
import { Badge } from "@/app/components/ui/badge";
import { OrderStatus } from "@/app/lib/orders/definitions";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";

type QuickStatusIndicatorsProps = {
	product: {
		totals: Record<OrderStatus, number>;
	};
	isExpanded: boolean;
};

export default function QuickStatusIndicators({
	product,
	isExpanded,
}: QuickStatusIndicatorsProps) {
	return (
		<div className="flex items-center gap-2">
			<div className="flex gap-1">
				{product.totals.paid > 0 && (
					<Badge
						variant="outline"
						className={`${getStatusColor("paid")} text-xs px-1.5 py-0.5`}
					>
						{product.totals.paid}
					</Badge>
				)}
				{product.totals.pending > 0 && (
					<Badge
						variant="outline"
						className={`${getStatusColor("pending")} text-xs px-1.5 py-0.5`}
					>
						{product.totals.pending}
					</Badge>
				)}
				{product.totals.processing > 0 && (
					<Badge
						variant="outline"
						className={`${getStatusColor("processing")} text-xs px-1.5 py-0.5`}
					>
						{product.totals.processing}
					</Badge>
				)}
				{product.totals.delivered > 0 && (
					<Badge
						variant="outline"
						className={`${getStatusColor("delivered")} text-xs px-1.5 py-0.5`}
					>
						{product.totals.delivered}
					</Badge>
				)}
				{product.totals.cancelled > 0 && (
					<Badge
						variant="outline"
						className={`${getStatusColor("cancelled")} text-xs px-1.5 py-0.5`}
					>
						{product.totals.cancelled}
					</Badge>
				)}
			</div>
			{isExpanded ? (
				<ChevronUpIcon className="h-4 w-4 text-muted-foreground" />
			) : (
				<ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
			)}
		</div>
	);
}
