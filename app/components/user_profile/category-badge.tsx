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
  if (
    profile.category === "illustration" ||
    profile.category === "new_artist"
  ) {
    content = (
      <>
        <BrushIcon className="h-4 w-4 mr-1" />
        Ilustrador
      </>
    );
  }

  if (profile.category === "gastronomy") {
    content = (
      <>
        <ChefHatIcon className="h-4 w-4 mr-1" />
        Gastronomía
      </>
    );
  }

  if (profile.category === "entrepreneurship") {
    content = (
      <>
        <BriefcaseIcon className="h-4 w-4 mr-1" />
        Emprendedor
      </>
    );
  }

  if (profile.banned) {
    variant = "destructive";
    content = (
      <>
        <BanIcon className="h-4 w-4 mr-1" />
        Perfil deshabilitado
      </>
    );
  }

  return <Badge variant={variant}>{content}</Badge>;
}
