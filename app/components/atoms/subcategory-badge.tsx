import { Badge, BadgeVariant } from "@/app/components/ui/badge";
import { Subcategory } from "@/app/lib/subcategories/definitions";
import { UserCategory } from "@/app/api/users/definitions";

export default function SubcategoryBadge({
	subcategory,
	category,
}: {
	subcategory: Subcategory;
	category?: UserCategory;
}) {
	return (
		<Badge
			className="font-normal min-w-fit"
			variant={(category || subcategory.category) as BadgeVariant}
		>
			{subcategory.label}
		</Badge>
	);
}
