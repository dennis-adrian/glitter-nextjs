import { cn } from "@/app/lib/utils";

import { UserCategory } from "@/app/api/users/definitions";
import { Badge } from "@/app/components/ui/badge";
import {
  getCategoryLabel,
  getCategoryOccupationLabel,
} from "@/app/lib/maps/helpers";

type CategoryBadgeProps = {
  category: UserCategory;
  useOccupationLabel?: boolean;
};

export default function CategoryBadge({
  category,
  useOccupationLabel = true,
}: CategoryBadgeProps) {
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
      {useOccupationLabel
        ? getCategoryOccupationLabel(category, { singular: true })
        : getCategoryLabel(category)}
    </Badge>
  );
}
