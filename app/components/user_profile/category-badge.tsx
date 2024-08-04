import { ProfileType } from "@/app/api/users/definitions";
import { Badge, BadgeProps } from "@/app/components/ui/badge";
import { BanIcon, BriefcaseIcon, BrushIcon, ChefHatIcon } from "lucide-react";

export default function ProfileCategoryBadge({
  profile,
}: {
  profile: ProfileType;
}) {
  let content;
  let variant: BadgeProps["variant"] = "default";
  let styles = "";
  const subcategoryLabel = profile.profileSubcategories[0]?.subcategory?.label;

  if (!subcategoryLabel) {
    return <Badge variant="outline">Sin categoría</Badge>;
  }

  if (
    profile.category === "illustration" ||
    profile.category === "new_artist"
  ) {
    content = (
      <>
        <BrushIcon className="h-4 w-4 mr-1" />
        {subcategoryLabel}
      </>
    );
  }

  if (profile.category === "gastronomy") {
    styles = "bg-amber-500 hover:bg-amber-400";
    content = (
      <>
        <ChefHatIcon className="h-4 w-4 mr-1" />
        {subcategoryLabel}
      </>
    );
  }

  if (profile.category === "entrepreneurship") {
    styles = "bg-pink-500 hover:bg-pink-400";
    content = (
      <>
        <BriefcaseIcon className="h-4 w-4 mr-1" />
        {subcategoryLabel}
      </>
    );
  }

  if (profile.status === "banned") {
    variant = "destructive";
    content = (
      <>
        <BanIcon className="h-4 w-4 mr-1" />
        Perfil deshabilitado
      </>
    );
  }

  return (
    <Badge className={styles} variant={variant}>
      {content}
    </Badge>
  );
}
