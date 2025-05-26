import { getStatusColor } from "@/app/components/organisms/orders/order_totals_card/utils";
import { Badge } from "@/app/components/ui/badge";
import { OrderStatus } from "@/app/lib/orders/definitions";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";

type QuickStatusIndicatorsProps = {
	product: {
		totals: Partial<Record<OrderStatus, number>>;
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
				{(Object.entries(product.totals) as [OrderStatus, number][])
					.filter(([_, total]) => total > 0)
					.map(([status, total]) => (
						<Badge
							key={status}
							variant="outline"
							className={`${getStatusColor(status)} text-xs px-1.5 py-0.5`}
						>
							{total}
						</Badge>
					))}
			</div>
			{isExpanded ? (
				<ChevronUpIcon className="h-4 w-4 text-muted-foreground" />
			) : (
				<ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
			)}
		</div>
	);
}
