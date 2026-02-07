import { ProfileType } from "@/app/api/users/definitions";
import SubcategoryBadge from "@/app/components/atoms/subcategory-badge";
import { RedirectButton } from "@/app/components/redirect-button";
import { Badge } from "@/app/components/ui/badge";
import { Card, CardContent } from "@/app/components/ui/card";
import { isProfileComplete } from "@/app/lib/utils";
import {
	ArrowRightIcon,
	CheckCircle2Icon,
	CircleAlertIcon,
} from "lucide-react";
import Image from "next/image";

type ProfileOverviewSectionProps = {
	profile: ProfileType;
};

const statusLabels: Record<string, string> = {
	pending: "Pendiente",
	verified: "Verificado",
	rejected: "Rechazado",
	banned: "Suspendido",
};

const statusColors: Record<string, string> = {
	pending: "bg-gray-500/20 text-gray-800 border-gray-300",
	verified: "bg-green-500/20 text-green-800 border-green-300",
	rejected: "bg-red-500/20 text-red-800 border-red-300",
	banned: "bg-red-500/20 text-red-800 border-red-300",
};

export default function ProfileOverviewSection({
	profile,
}: ProfileOverviewSectionProps) {
	const profileComplete = isProfileComplete(profile);

	return (
		<Card>
			<CardContent className="p-4">
				<div className="flex items-start gap-4">
					<div className="relative w-16 h-16 rounded-full overflow-hidden shrink-0 bg-muted">
						{profile.imageUrl ? (
							<Image
								src={profile.imageUrl}
								alt={profile.displayName || "Perfil"}
								fill
								className="object-cover"
							/>
						) : (
							<div className="w-full h-full flex items-center justify-center text-muted-foreground text-xl font-bold">
								{(profile.displayName || profile.firstName || "?")
									.charAt(0)
									.toUpperCase()}
							</div>
						)}
					</div>
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2 flex-wrap">
							<h3 className="font-semibold text-base truncate">
								{profile.displayName ||
									`${profile.firstName || ""} ${profile.lastName || ""}`.trim() ||
									"Sin nombre"}
							</h3>
							<Badge
								className={`font-normal text-xs ${statusColors[profile.status]}`}
							>
								{statusLabels[profile.status]}
							</Badge>
						</div>

						{profile.profileSubcategories.length > 0 && (
							<div className="flex flex-wrap gap-1 mt-1">
								{profile.profileSubcategories
									.slice(0, 3)
									.map((ps) => (
										<SubcategoryBadge
											key={ps.id}
											subcategory={ps.subcategory}
											category={profile.category}
										/>
									))}
								{profile.profileSubcategories.length > 3 && (
									<Badge variant="outline" className="text-xs font-normal">
										+{profile.profileSubcategories.length - 3}
									</Badge>
								)}
							</div>
						)}

						<div className="flex items-center gap-1 mt-2 text-xs">
							{profileComplete ? (
								<span className="flex items-center gap-1 text-green-600">
									<CheckCircle2Icon className="w-3.5 h-3.5" />
									Perfil completo
								</span>
							) : (
								<span className="flex items-center gap-1 text-amber-600">
									<CircleAlertIcon className="w-3.5 h-3.5" />
									Perfil incompleto
								</span>
							)}
						</div>

						<RedirectButton
							href="/my_profile"
							variant="link"
							size="sm"
							className="p-0 h-auto mt-2 text-xs"
						>
							Ver perfil completo
							<ArrowRightIcon className="ml-1 w-3 h-3" />
						</RedirectButton>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
