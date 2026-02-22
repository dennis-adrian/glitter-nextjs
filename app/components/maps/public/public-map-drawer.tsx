"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { Badge } from "@/app/components/ui/badge";
import { socialsUrls, socialsIcons } from "@/app/lib/users/utils";

type PublicMapStandCardProps = {
	stand: StandWithReservationsWithParticipants | null;
	open: boolean;
	sectorName?: string;
	onOpenChange: (open: boolean) => void;
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
	onOpenChange,
}: PublicMapStandCardProps) {
	const [activeTab, setActiveTab] = useState(0);

	if (!stand || !open) return null;

	const participants = stand.reservations
		.filter((r) => r.status !== "rejected")
		.flatMap((r) => r.participants);

	if (participants.length === 0) return null;

	const currentParticipant = participants[activeTab] ?? participants[0];
	const { user } = currentParticipant;
	const standLabel = `${stand.label}${stand.standNumber}`;
	const categoryLabel = getCategoryLabel(stand.standCategory);
	const products = stand.standSubcategories.map((sc) => sc.subcategory.label);

	return (
		<div className="fixed bottom-6 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50">
			<div className="bg-white rounded-lg shadow-2xl border-t-4 border-primary overflow-hidden">
				{/* Header */}
				<div className="p-4 pb-3 border-b border-border">
					<div className="flex items-start justify-between mb-3">
						<div className="flex items-center gap-2 flex-wrap">
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
						<button
							onClick={() => onOpenChange(false)}
							className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 text-sm shrink-0 ml-2"
						>
							<X className="w-4 h-4" />
							Cerrar
						</button>
					</div>

					{/* Participant tabs */}
					{participants.length > 1 && (
						<div className="flex gap-2 mb-3 overflow-x-auto pb-1 -mx-1 px-1">
							{participants.map((p, index) => (
								<button
									key={p.id}
									onClick={() => setActiveTab(index)}
									className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all shrink-0 ${
										index === activeTab
											? "bg-white shadow-sm border-primary"
											: "bg-gray-50 hover:bg-gray-100 border-border"
									}`}
								>
									<Avatar className="w-6 h-6">
										<AvatarImage
											src={p.user.imageUrl ?? undefined}
											alt={p.user.displayName ?? "Participante"}
										/>
									</Avatar>
									<span className="text-xs font-medium text-foreground truncate max-w-[100px]">
										{p.user.displayName ?? "Participante"}
									</span>
								</button>
							))}
						</div>
					)}

					{/* Current participant detail */}
					<div className="flex items-center gap-3">
						<Avatar className="w-16 h-16 border-2 border-primary shrink-0">
							<AvatarImage
								src={user.imageUrl ?? undefined}
								alt={user.displayName ?? "Participante"}
							/>
						</Avatar>
						<div className="flex-1 min-w-0">
							<h3 className="text-xl font-bold text-foreground mb-0.5 truncate">
								{user.displayName ?? "Participante"}
							</h3>
							<p className="text-sm text-muted-foreground">
								Stand #{standLabel}
								{sectorName ? ` • ${sectorName}` : ""}
							</p>
						</div>
					</div>
				</div>

				{/* Body */}
				{(products.length > 0 || user.userSocials.length > 0) && (
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
						{user.userSocials.length > 0 && (
							<div>
								<p className="text-xs text-muted-foreground mb-2">Contacto</p>
								<div className="space-y-2">
									{user.userSocials.map((social) => (
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
					</div>
				)}
			</div>
		</div>
	);
}
