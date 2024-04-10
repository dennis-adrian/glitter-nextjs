import { cn } from "@/app/lib/utils";

import { UserCategory } from "@/app/api/users/definitions";
import { Badge } from "@/app/components/ui/badge";
import { getCategoryOccupationLabel } from "@/app/lib/maps/helpers";

type CategoryBadgeProps = {
  category: UserCategory;
};

export default function CategoryBadge({ category }: CategoryBadgeProps) {
  let styles;
  if (category === "gastronomy") {
    styles = "bg-amber-500 hover:bg-amber-400";
  }

  if (category === "entrepreneurship") {
    styles = "bg-pink-500 hover:bg-pink-400";
  }

  return (
    <Badge
      className={cn(styles, "max-w-fit")}
      variant={category === "none" ? "dark" : "default"}
    >
      {getCategoryOccupationLabel(category, { singular: true })}
    </Badge>
  );
}
