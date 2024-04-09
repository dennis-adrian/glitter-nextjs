import { UserCategory } from "@/app/api/users/definitions";
import { Badge } from "@/app/components/ui/badge";
import { getCategoryOccupationLabel } from "@/app/lib/maps/helpers";

type CategoryBadgeProps = {
  category: UserCategory;
};

export default function CategoryBadge({ category }: CategoryBadgeProps) {
  let styles;
  if (category === "illustration") {
    styles = "bg-rose-400 hover:bg-rose-400";
  }

  if (category === "gastronomy") {
    styles = "bg-emerald-400 hover:bg-emerald-400";
  }

  if (category === "entrepreneurship") {
    styles = "bg-indigo-400 hover:bg-indigo-400";
  }

  return (
    <Badge
      className={styles}
      variant={category === "none" ? "dark" : "default"}
    >
      {getCategoryOccupationLabel(category, { singular: true })}
    </Badge>
  );
}
