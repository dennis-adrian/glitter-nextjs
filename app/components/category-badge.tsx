import { cn } from "@/app/lib/utils";

import { UserCategory } from "@/app/api/users/definitions";
import { Badge, BadgeProps, BadgeVariant } from "@/app/components/ui/badge";
import {
	getCategoryLabel,
	getCategoryOccupationLabel,
} from "@/app/lib/maps/helpers";

type CategoryBadgeProps = {
	category: UserCategory;
	useOccupationLabel?: boolean;
	className?: string;
} & BadgeProps;

export default function CategoryBadge({
	category,
	useOccupationLabel = true,
	className,
	...props
}: CategoryBadgeProps) {
	return (
		<Badge
			className={cn("font-bold min-w-fit uppercase", className)}
			variant={category as BadgeVariant}
			{...props}
		>
			{useOccupationLabel
				? getCategoryOccupationLabel(category, { singular: true })
				: getCategoryLabel(category)}
		</Badge>
	);
}
