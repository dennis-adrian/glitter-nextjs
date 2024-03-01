import { BaseProfile } from "@/app/api/users/definitions";
import { Badge } from "@/components/ui/badge";
import { BrushIcon, LockIcon, UserRoundIcon } from "lucide-react";
import React from "react";

type UserRoleBadgeProps = {
  role: BaseProfile["role"];
};

const UserRoleBadge = ({ role }: UserRoleBadgeProps) => {
  let badgeBg, icon, label;
  const iconClassNames = "w-4 h-4 mr-1";
  if (role === "admin") {
    label = "Admin";
    icon = <LockIcon className={iconClassNames} />;
    badgeBg = "bg-amber-600";
  }

  if (role === "festival_admin") {
    label = "Admin de festival";
    icon = <LockIcon className={iconClassNames} />;
    badgeBg = "bg-pink-500";
  }

  if (role === "artist") {
    label = "Artista";
    icon = <BrushIcon className={iconClassNames} />;
    badgeBg = "bg-pink-600";
  }

  if (role === "user") {
    label = "Usuario";
    icon = <UserRoundIcon className={iconClassNames} />;
    badgeBg = "bg-neutral-600";
  }

  return (
    <div>
      <Badge className={badgeBg}>
        {icon}
        {label}
      </Badge>
    </div>
  );
};

export default UserRoleBadge;
