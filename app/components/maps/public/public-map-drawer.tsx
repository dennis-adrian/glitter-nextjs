"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { getStandMapParticipants } from "@/app/components/maps/map-participants";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { Badge } from "@/app/components/ui/badge";
import { socialsUrls, socialsIcons } from "@/app/lib/users/utils";
import { formatStandLabel } from "@/app/lib/stands/helpers";

type PublicMapStandCardProps = {
	stand: StandWithReservationsWithParticipants | null;
	open: boolean;
	sectorName?: string;
	cardRef?: React.RefObject<HTMLDivElement | null>;
};

function getCategoryLabel(category: string): string {
	switch (category) {
		case "illustration":
		case "new_artist":
			return "ILUSTRACIÓN";
		case "gastronomy":
			return "GASTRONOMÍA";
		case "entrepreneurship":
			return "EMPRENDIMIENTO";
		default:
			return "";
	}
}

export default function PublicMapStandCard({
	stand,
	open,
	sectorName,
	cardRef,
}: PublicMapStandCardProps) {
	const [activeTab, setActiveTab] = useState(0);

	const participants = stand ? getStandMapParticipants(stand) : [];

	const clampedTab = Math.min(activeTab, Math.max(0, participants.length - 1));

	if (!stand || !open) return null;
	if (participants.length === 0) return null;

	const currentParticipant = participants[clampedTab] ?? participants[0];
	const standLabel = formatStandLabel(stand);
	const categoryLabel = getCategoryLabel(stand.standCategory);
	const products = stand.standSubcategories.map((sc) => sc.subcategory.label);

	return (
		<div
			ref={cardRef}
			className="fixed bottom-6 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 animate-in slide-in-from-bottom-4 fade-in-0 duration-150"
		>
			<div className="bg-white rounded-lg shadow-2xl border-t-4 border-primary overflow-hidden">
				{/* Header */}
				<div className="p-4 pb-3 border-b border-border">
					<div className="flex items-center gap-2 flex-wrap mb-3">
						<Badge className="font-bold px-3 py-1 rounded-full">
							{standLabel}
						</Badge>
						{categoryLabel && (
							<Badge
								variant="outline"
								className="text-xs font-semibold uppercase rounded-full border-primary text-primary"
							>
								{categoryLabel}
							</Badge>
						)}
					</div>

					{/* Participant tabs */}
					{participants.length > 1 && (
						<div className="flex gap-2 mb-3 overflow-x-auto pb-1 -mx-1 px-1">
							{participants.map((p, index) => (
								<button
									key={p.id}
									onClick={() => setActiveTab(index)}
									className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all shrink-0 ${
										index === clampedTab
											? "bg-white shadow-sm border-primary"
											: "bg-gray-50 hover:bg-gray-100 border-border"
									}`}
								>
									<Avatar className="w-6 h-6">
										<AvatarImage
											src={p.imageUrl ?? undefined}
											alt={p.displayName}
										/>
									</Avatar>
									<span className="text-xs font-medium text-foreground truncate max-w-25">
										{p.displayName}
									</span>
								</button>
							))}
						</div>
					)}

					{/* Current participant detail */}
					<div className="flex items-center gap-3">
						<Avatar className="w-16 h-16 border-2 border-primary shrink-0">
							<AvatarImage
								src={currentParticipant.imageUrl ?? undefined}
								alt={currentParticipant.displayName}
							/>
						</Avatar>
						<div className="flex-1 min-w-0">
							<h3 className="text-xl font-bold text-foreground mb-0.5 truncate">
								{currentParticipant.displayName}
							</h3>
							<p className="text-sm text-muted-foreground">
								Stand #{standLabel}
								{sectorName ? ` • ${sectorName}` : ""}
							</p>
							{currentParticipant.kind === "external" && (
								<Badge
									variant="outline"
									className="mt-2 rounded-full border-teal-600 text-teal-700"
								>
									{currentParticipant.categoryLabel}
								</Badge>
							)}
						</div>
					</div>
				</div>

				{/* Body */}
				{(products.length > 0 ||
					currentParticipant.userSocials.length > 0 ||
					currentParticipant.links.length > 0) && (
					<div className="p-4 space-y-3">
						{/* Products */}
						{products.length > 0 && (
							<div>
								<p className="text-xs text-muted-foreground mb-2">Productos</p>
								<div className="flex flex-wrap gap-2">
									{products.map((product, index) => (
										<Badge
											key={index}
											variant="outline"
											className="text-xs rounded-full border-primary text-primary"
										>
											{product}
										</Badge>
									))}
								</div>
							</div>
						)}

						{/* Social links */}
						{currentParticipant.userSocials.length > 0 && (
							<div>
								<p className="text-xs text-muted-foreground mb-2">Contacto</p>
								<div className="space-y-2">
									{currentParticipant.userSocials.map((social) => (
										<a
											key={social.id}
											href={`${socialsUrls[social.type]}${social.username}`}
											target="_blank"
											rel="noopener noreferrer"
											className="flex items-center gap-2 text-sm hover:underline font-medium"
											style={{
												color:
													social.type === "instagram" ? "#E8356A" : undefined,
											}}
										>
											<FontAwesomeIcon
												className="w-4 h-4"
												icon={socialsIcons[social.type]}
											/>
											@{social.username}
										</a>
									))}
								</div>
							</div>
						)}
						{currentParticipant.links.length > 0 && (
							<div>
								<p className="text-xs text-muted-foreground mb-2">Contacto</p>
								<div className="space-y-2">
									{currentParticipant.links.map((link) => (
										<a
											key={link.href}
											href={link.href}
											target="_blank"
											rel="noopener noreferrer"
											className="flex items-center gap-2 text-sm hover:underline font-medium text-teal-700"
										>
											{link.label}
										</a>
									))}
								</div>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
