import { ProfileType } from "@/app/api/users/definitions";
import { RedirectButton } from "@/app/components/redirect-button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { fetchUserInfractions } from "@/app/lib/users/actions";
import {
	AlertTriangleIcon,
	ArrowRightIcon,
	CircleAlertIcon,
	ShieldAlertIcon,
} from "lucide-react";

type InfractionsSectionProps = {
	profile: ProfileType;
};

const severityColors: Record<string, string> = {
	low: "bg-yellow-500/20 text-yellow-800 border-yellow-300",
	medium: "bg-orange-500/20 text-orange-800 border-orange-300",
	high: "bg-red-500/20 text-red-800 border-red-300",
	critical: "bg-red-700/20 text-red-900 border-red-500",
};

const severityLabels: Record<string, string> = {
	low: "Leve",
	medium: "Moderada",
	high: "Alta",
	critical: "Crítica",
};

export default async function InfractionsSection({
	profile,
}: InfractionsSectionProps) {
	const infractions = await fetchUserInfractions(profile.id);

	// Don't render anything if user has no infractions
	if (infractions.length === 0) return null;

	const activeSanctions = infractions.flatMap((infraction) =>
		infraction.sanctions.filter((s) => s.active),
	);

	const recentInfractions = infractions.slice(0, 2);

	return (
		<Card className="border-red-200">
			<CardHeader>
				<div className="flex items-center justify-between">
					<CardTitle className="text-lg flex items-center gap-2 text-red-800">
						<ShieldAlertIcon className="w-5 h-5" />
						Infracciones
					</CardTitle>
					<RedirectButton
						href={`/profiles/${profile.id}/infractions`}
						variant="link"
						size="sm"
						className="p-0 h-auto text-xs"
					>
						Ver detalles
						<ArrowRightIcon className="ml-1 w-3 h-3" />
					</RedirectButton>
				</div>
			</CardHeader>
			<CardContent className="space-y-3">
				{activeSanctions.length > 0 && (
					<div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-md p-3">
						<AlertTriangleIcon className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
						<div>
							<p className="text-sm font-medium text-red-800">
								Tenés {activeSanctions.length} sanción
								{activeSanctions.length > 1 ? "es" : ""} activa
								{activeSanctions.length > 1 ? "s" : ""}
							</p>
							<p className="text-xs text-red-700 mt-0.5">
								Esto puede afectar tu participación en futuros
								festivales
							</p>
						</div>
					</div>
				)}

				{recentInfractions.map((infraction) => (
					<div
						key={infraction.id}
						className="flex items-start gap-3 p-3 bg-muted/50 rounded-md"
					>
						<CircleAlertIcon className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2 flex-wrap">
								<p className="text-sm font-medium">
									{infraction.type.label}
								</p>
								<Badge
									className={`text-xs font-normal ${severityColors[infraction.type.severity]}`}
								>
									{severityLabels[infraction.type.severity]}
								</Badge>
							</div>
							{infraction.description && (
								<p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
									{infraction.description}
								</p>
							)}
							{infraction.festival && (
								<p className="text-xs text-muted-foreground mt-0.5">
									{infraction.festival.name}
								</p>
							)}
						</div>
					</div>
				))}

				{infractions.length > 2 && (
					<p className="text-xs text-muted-foreground text-center">
						y {infractions.length - 2} infracción
						{infractions.length - 2 > 1 ? "es" : ""} más
					</p>
				)}
			</CardContent>
		</Card>
	);
}
