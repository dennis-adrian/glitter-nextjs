import {
	AlertCircleIcon,
	CheckCircleIcon,
	ClockIcon,
	CogIcon,
	CreditCardIcon,
} from "lucide-react";
import { Badge } from "../ui/badge";
import { OrderStatus } from "@/app/lib/orders/definitions";
import { getOrderStatusLabel } from "@/app/lib/orders/utils";

type OrderStatusBadgeProps = {
  status: OrderStatus;
};

export default function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  const statusLabel = getOrderStatusLabel(status);
  switch (status) {
		case "pending":
			return (
				<Badge
					variant="outline"
					className="text-gray-500 border-gray-200 bg-gray-50 gap-1"
				>
					<ClockIcon className="h-3 w-3" />
					{statusLabel}
				</Badge>
			);
		case "processing":
			return (
				<Badge
					variant="outline"
					className="text-blue-600 border-blue-200 bg-blue-50 gap-1"
				>
					<CogIcon className="h-3 w-3" />
					{statusLabel}
				</Badge>
			);
		case "paid":
			return (
				<Badge
					variant="outline"
					className="text-amber-700 border-amber-200 bg-amber-50 gap-1"
				>
					<CreditCardIcon className="h-3 w-3" />
					{statusLabel}
				</Badge>
			);
		case "delivered":
			return (
				<Badge
					variant="outline"
					className="text-green-700 border-green-200 bg-green-50 gap-1"
				>
					<CheckCircleIcon className="h-3 w-3" />
					{statusLabel}
				</Badge>
			);
		case "cancelled":
			return (
				<Badge
					variant="outline"
					className="text-red-600 border-red-200 bg-red-50 gap-1"
				>
					<AlertCircleIcon className="h-3 w-3" />
					{statusLabel}
				</Badge>
			);
		default:
			return (
				<Badge variant="outline" className="gap-1">
					<ClockIcon className="h-3 w-3" />
					{statusLabel}
				</Badge>
			);
	}
}
