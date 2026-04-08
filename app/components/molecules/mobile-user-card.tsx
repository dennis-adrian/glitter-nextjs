import {
	ChevronRightIcon,
	EllipsisVerticalIcon,
	MailIcon,
	PhoneIcon,
} from "lucide-react";
import { DateTime } from "luxon";

import { ProfileType } from "@/app/api/users/definitions";
import CategoryBadge from "@/app/components/category-badge";
import SocialMediaBadge from "@/app/components/social-media-badge";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/app/components/ui/accordion";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import ProfileStatusCell from "@/app/components/users/cells/profile-status";
import { formatDate } from "@/app/lib/formatters";
import ParticipationsCell from "../users/cells/participations-cell";
import ProfileQuickActions from "../user_profile/public_profile/quick-actions";
import { Button } from "../ui/button";

type MobileUserCardProps = {
	user: ProfileType;
};

export default function MobileUserCard({ user }: MobileUserCardProps) {
	const {
		birthdate,
		category,
		status,
		imageUrl,
		displayName,
		firstName,
		lastName,
		phoneNumber,
		updatedAt,
		id,
		verifiedAt,
		participations,
		email,
		createdAt,
	} = user;

	const age = birthdate
		? DateTime.now()
				.diff(DateTime.fromJSDate(birthdate), "years")
				.years.toFixed(0)
		: null;

	return (
		<div className="rounded-md border shadow-sm">
			{/* Header */}
			<div className="border-b p-4 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<CategoryBadge
						className="font-medium text-[10px]"
						category={category}
					/>
					<ProfileStatusCell className="text-xs gap-1" status={status} />
				</div>
				<ChevronRightIcon className="w-4 h-4" />
			</div>
			{/* Body */}
			<div className="flex flex-col">
				<div className="flex justify-between px-4 py-2">
					<div className="flex items-center gap-2">
						<Avatar className="w-10 h-10 border-muted-foreground/20 border-2">
							<AvatarImage
								src={imageUrl}
								alt={displayName || "Imagen de perfil"}
							/>
						</Avatar>
						<div>
							<p className="text-sm font-medium">{displayName}</p>
							<p className="text-xs text-muted-foreground">
								{firstName || ""} {lastName || ""}{" "}
								{age != null ? `(${age} años)` : ""}
							</p>
						</div>
					</div>
					<ProfileQuickActions profile={user} hideViewProfile>
						<Button variant="ghost" className="h-8 w-8 p-0 -mr-2">
							<span className="sr-only">Open menu</span>
							<EllipsisVerticalIcon className="w-4 h-4" />
						</Button>
					</ProfileQuickActions>
				</div>
				{participations?.length > 0 && (
					<div className="text-sm px-4 pb-2">
						<p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">
							Participaciones
						</p>
						<ParticipationsCell participations={participations} />
					</div>
				)}
				{/* Footer */}
				<Accordion type="single" collapsible className="w-full">
					<AccordionItem value={`user-${id}`} className="border-b-0">
						<AccordionTrigger className="py-2 text-xs border-t px-4 uppercase font-medium [&[data-state=closed]_.label-open]:hidden [&[data-state=open]_.label-closed]:hidden">
							<span className="label-closed">ver mas</span>
							<span className="label-open">ver menos</span>
						</AccordionTrigger>
						<AccordionContent className="pt-2 text-sm flex flex-col gap-3 px-4">
							<div>
								<p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">
									contacto
								</p>
								<div className="flex flex-col gap-1">
									<div className="flex gap-3 items-center">
										<MailIcon className="w-4 h-4" />
										<span>{email}</span>
									</div>
									{phoneNumber && (
										<div className="flex gap-1 items-center">
											<PhoneIcon className="w-4 h-4 mr-1" />
											<SocialMediaBadge
												socialMediaType="whatsapp"
												username={phoneNumber}
											/>
										</div>
									)}
								</div>
							</div>
							{verifiedAt && (
								<div>
									<p className="text-[10px] uppercase font-semibold text-muted-foreground">
										verificado
									</p>
									<p>
										{formatDate(verifiedAt).toLocaleString(
											DateTime.DATETIME_MED_WITH_SECONDS,
										)}
									</p>
								</div>
							)}
							<div>
								<p className="text-[10px] uppercase font-semibold text-muted-foreground">
									actualizado
								</p>
								<p>
									{formatDate(updatedAt).toLocaleString(
										DateTime.DATETIME_MED_WITH_SECONDS,
									)}
								</p>
							</div>
							<div>
								<p className="text-[10px] uppercase font-semibold text-muted-foreground">
									creado
								</p>
								<p>
									{formatDate(createdAt).toLocaleString(
										DateTime.DATETIME_MED_WITH_SECONDS,
									)}
								</p>
							</div>
						</AccordionContent>
					</AccordionItem>
				</Accordion>
			</div>
		</div>
	);
}
