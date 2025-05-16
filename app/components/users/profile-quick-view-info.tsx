"use client";

import { BadgeCheckIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";

import {
  BaseProfile,
  ProfileSubcategoryWithSubcategory,
} from "@/app/api/users/definitions";
import SubcategoryBadge from "@/app/components/atoms/subcategory-badge";
import ProfileAvatar from "@/app/components/common/profile-avatar";
import { cn, truncateText } from "@/app/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import SocialMediaBadge from "@/app/components/social-media-badge";

type UserQuickViewInfoProps = {
	avatarClassName?: string;
	className?: string;
	profile: BaseProfile & {
		profileSubcategories: ProfileSubcategoryWithSubcategory[];
	};
	showAdminControls?: boolean;
	hideAvatar?: boolean;
	truncateEmail?: boolean;
};
export default function ProfileQuickViewInfo(props: UserQuickViewInfoProps) {
	return (
		<div className={cn("flex gap-4", props.className)}>
			{!props.hideAvatar && (
				<div>
					<ProfileAvatar
						profile={{
							...props.profile,
							participations: [],
						}}
						className={props.avatarClassName}
						showBadge={false}
					/>
				</div>
			)}
			<div className="flex flex-col w-full">
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
				<div className="text-sm text-muted-foreground">
					<span className="flex gap-1 items-center font-normal">
						{props.truncateEmail
							? truncateText(props.profile.email, 20, "email")
							: props.profile.email}
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
				{props.showAdminControls && (
					<div className="mt-2">
						<SocialMediaBadge
							socialMediaType="whatsapp"
							username={`${props.profile.phoneNumber}`}
						/>
					</div>
				)}
				<div className="flex flex-wrap gap-1 mt-2">
					{props.profile.profileSubcategories.map((subcategory) => (
						<SubcategoryBadge
							key={subcategory.id}
							subcategory={subcategory.subcategory}
						/>
					))}
				</div>
			</div>
		</div>
	);
}
