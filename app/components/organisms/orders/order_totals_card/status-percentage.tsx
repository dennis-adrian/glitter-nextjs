import { getStatusColor } from "@/app/components/organisms/orders/order_totals_card/utils";

import { Badge } from "@/app/components/ui/badge";
import { Progress } from "@/app/components/ui/progress";
import { OrderStatus } from "@/app/lib/orders/definitions";
import { getOrderStatusLabel } from "@/app/lib/orders/utils";
import {
	AlertCircleIcon,
	BanIcon,
	CheckCircleIcon,
	CheckIcon,
	ClockIcon,
	CogIcon,
	CreditCardIcon,
} from "lucide-react";

type StatusPercentageProps = {
	status: OrderStatus;
	percentage: number;
	total: number;
};
export default function StatusPercentage({
	status,
	percentage,
	total,
}: StatusPercentageProps) {
	let Icon = <ClockIcon className="h-4 w-4 text-gray-500" />;

	switch (status) {
		case "paid":
			Icon = <CreditCardIcon className="h-4 w-4 text-amber-700" />;
			break;
		case "processing":
			Icon = <CogIcon className="h-4 w-4 text-blue-600" />;
			break;
		case "delivered":
			Icon = <CheckCircleIcon className="h-4 w-4 text-green-600" />;
			break;
		case "cancelled":
			Icon = <AlertCircleIcon className="h-4 w-4 text-red-600" />;
			break;
	}

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					{Icon}
					<span className="text-sm font-medium">
						{getOrderStatusLabel(status)}
					</span>
				</div>
				<div className="flex items-center gap-2">
					<Badge variant="outline" className={getStatusColor(status)}>
						{total}
					</Badge>
					<span className="text-xs text-muted-foreground w-10 text-right">
						{percentage.toFixed(0)}%
					</span>
				</div>
			</div>
			<Progress
				value={percentage}
				className="h-2"
				indicatorClassName="bg-gray-400"
			/>
		</div>
	);
}
