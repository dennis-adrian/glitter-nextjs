import { ProfileType } from "@/app/api/users/definitions";
import { Badge } from "@/app/components/ui/badge";
import { BriefcaseIcon, BrushIcon, ChefHatIcon } from "lucide-react";

export default function ProfileCategoryBadge({
  profile,
}: {
  profile: ProfileType;
}) {
  let content;
  if (profile.category === "illustration") {
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

  return <Badge>{content}</Badge>;
}
