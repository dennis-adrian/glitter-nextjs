import { Badge, BadgeVariant } from "@/app/components/ui/badge";
import { Subcategory } from "@/app/lib/subcategories/definitions";

export default function SubcategoryBadge({
  subcategory,
}: {
  subcategory: Subcategory;
}) {
  return (
    <Badge
      className="font-normal min-w-fit"
      variant={subcategory.category as BadgeVariant}
    >
      {subcategory.label}
    </Badge>
  );
}
