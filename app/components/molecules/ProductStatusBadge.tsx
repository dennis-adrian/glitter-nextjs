import { FC } from "react";
import { Badge } from "@/components/ui/badge";
import { ClockIcon, TagIcon } from "lucide-react";
import { BaseProduct } from "@/lib/products/definitions";

type ProductStatusBadgeProps = {
	status: BaseProduct["status"];
	discount?: number | null;
	discountUnit?: BaseProduct["discountUnit"];
};
export const ProductStatusBadge: FC<ProductStatusBadgeProps> = ({
	status,
	discount,
	discountUnit = "percentage",
}) => {
	if (status === "sale" && discount) {
		return (
			<Badge variant="destructive" className="font-medium">
				<TagIcon className="h-3 w-3 mr-1" />
				{discount}
				{discountUnit === "amount" ? "Bs" : "%"} DESC
			</Badge>
		);
	}

	if (status === "presale") {
		return (
			<Badge className="bg-amber-500 hover:bg-amber-600 font-medium">
				<ClockIcon className="h-3 w-3 mr-1" />
				Pre-venta
			</Badge>
		);
	}

	return null;
};
