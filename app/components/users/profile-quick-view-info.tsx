"use client";

import { BadgeCheckIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";

import { BaseProfile } from "@/app/api/users/definitions";
import CategoryBadge from "@/app/components/category-badge";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn, truncateText } from "@/app/lib/utils";
import ProfileAvatar from "@/app/components/common/profile-avatar";

type UserQuickViewInfoProps = {
  avatarClassName?: string;
  className?: string;
  profile: BaseProfile;
  showAdminControls?: boolean;
};
export default function ProfileQuickViewInfo(props: UserQuickViewInfoProps) {
  return (
    <div className={cn("flex gap-4", props.className)}>
      <div>
        <ProfileAvatar
          profile={{
            ...props.profile,
            userSocials: [],
            userRequests: [],
            participations: [],
            profileTags: [],
            profileSubcategories: [],
          }}
          className={props.avatarClassName}
          showBadge={false}
        />
      </div>
      <div className="flex flex-col gap-1 w-full">
        <span className="flex gap-1 items-center">
          <h3 className="font-medium leading-4">
            {props.profile.displayName || ""}
          </h3>

          {props.profile.status === "verified" && props.showAdminControls && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <BadgeCheckIcon className="w-4 h-4" />
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-sm">Verificado</div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </span>
        <CategoryBadge category={props.profile.category} />
        <div className="text-sm text-muted-foreground">
          <span className="flex gap-1 items-center">
            {truncateText(props.profile.email, 20, "email")}
            {props.showAdminControls && (
              <CopyIcon
                className="w-4 h-4 hover:transition cursor-pointer"
                onClick={() => {
                  navigator.clipboard.writeText(props.profile.email);
                  toast.success("Copiado");
                }}
              />
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
