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
import { cn } from "@/app/lib/utils";

type UserQuickViewInfoProps = {
  className?: string;
  profile: BaseProfile;
};
export default function ProfileQuickViewInfo(props: UserQuickViewInfoProps) {
  return (
    <div className={cn("flex gap-4", props.className)}>
      <Avatar>
        <AvatarImage
          src={props.profile.imageUrl || "/img/profile-avatar.png"}
          alt={props.profile.displayName || "avatar"}
        />
      </Avatar>
      <div className="flex flex-col gap-1">
        <span className="flex gap-1 items-center">
          <h3 className="font-medium text-sm">{props.profile.displayName}</h3>

          {props.profile.verified && (
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
        <div className="text-sm max-w-[160px] sm:max-w-full truncate text-muted-foreground">
          <span className="flex gap-1 items-center">
            {props.profile.email}
            <CopyIcon
              className="w-4 h-4 hover:transition cursor-pointer"
              onClick={() => {
                navigator.clipboard.writeText(props.profile.email);
                toast.success("Copiado");
              }}
            />
          </span>
        </div>
      </div>
    </div>
  );
}
