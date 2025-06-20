import { cn } from "@/app/lib/utils";

import { UserCategory } from "@/app/api/users/definitions";
import { Badge, BadgeVariant } from "@/app/components/ui/badge";
import {
	getCategoryLabel,
	getCategoryOccupationLabel,
} from "@/app/lib/maps/helpers";

type CategoryBadgeProps = {
	category: UserCategory;
	useOccupationLabel?: boolean;
	className?: string;
};

export default function CategoryBadge({
	category,
	useOccupationLabel = true,
	className,
}: CategoryBadgeProps) {
	return (
		<Badge
			className={cn("font-normal min-w-fit", className)}
			variant={category as BadgeVariant}
		>
			{useOccupationLabel
				? getCategoryOccupationLabel(category, { singular: true })
				: getCategoryLabel(category)}
		</Badge>
	);
}
