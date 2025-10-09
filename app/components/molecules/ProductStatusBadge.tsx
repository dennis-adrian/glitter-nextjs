import { FC } from "react";
import { Badge } from "@/components/ui/badge";
import { ClockIcon, TagIcon } from "lucide-react";
import { BaseProduct } from "@/lib/products/definitions";

type ProductStatusBadgeProps = {
	status: "available" | "presale" | "sale";
	discount?: number;
	discountUnit?: BaseProduct["discountUnit"];
};
export const ProductStatusBadge: FC<ProductStatusBadgeProps> = ({
	status,
	discount,
	discountUnit = "percentage",
}) => {
	if (status === "sale") {
		return (
			<Badge
				variant="destructive"
				className="absolute top-2 left-2 font-medium"
			>
				<TagIcon className="h-3 w-3 mr-1" />
				{discount} {discountUnit === "amount" ? "Bs" : "%"} DESC
			</Badge>
		);
	}
	if (status === "presale") {
		return (
			<Badge className="absolute top-2 left-2 bg-amber-500 hover:bg-amber-600 font-medium">
				<ClockIcon className="h-3 w-3 mr-1" />
				Pre-venta
			</Badge>
		);
	}

	return null;
};
