import Link from "next/link";
import { PencilIcon, ClipboardListIcon } from "lucide-react";

import { RedirectButton } from "@/app/components/redirect-button";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Progress } from "@/app/components/ui/progress";
import { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";

type ActivitySummaryCardProps = {
	activity: FestivalActivityWithDetailsAndParticipants;
	festivalId: number;
};

export default function ActivitySummaryCard({
	activity,
	festivalId,
}: ActivitySummaryCardProps) {
	const showVariantHeaders = activity.details.length > 1;

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-base font-semibold leading-tight">
					<Link
						href={`/dashboard/festivals/${festivalId}/festival_activities/${activity.id}`}
						className="hover:underline"
					>
						{activity.name}
					</Link>
				</CardTitle>
			</CardHeader>
			<CardContent className="pt-0 space-y-3">
				<div className="space-y-2">
					{activity.details.map((detail, index) => {
						const count = detail.participants.length;
						const limit = detail.participationLimit;
						const pct = limit ? Math.round((count / limit) * 100) : null;

						return (
							<div key={detail.id} className="space-y-1">
								{showVariantHeaders && (
									<p className="text-xs text-muted-foreground">
										Variante {index + 1}
										{detail.description ? ` — ${detail.description}` : ""}
									</p>
								)}
								<div className="flex items-center justify-between text-sm">
									<span>
										{count}
										{limit ? `/${limit}` : ""} inscritos
									</span>
									{pct !== null && (
										<span className="text-xs text-muted-foreground">{pct}%</span>
									)}
								</div>
								{limit && (
									<Progress value={pct ?? 0} className="h-1.5" />
								)}
							</div>
						);
					})}
				</div>

				{activity.waitlistWindowMinutes !== null &&
					activity.waitlistEntries.length > 0 && (
						<p className="text-xs text-muted-foreground">
							Lista de espera: {activity.waitlistEntries.length}
						</p>
					)}

				<div className="flex gap-2 pt-1">
					<Button asChild variant="outline" size="sm">
						<Link
							href={`/dashboard/festivals/${festivalId}/festival_activities/${activity.id}/edit`}
						>
							<PencilIcon className="w-4 h-4 mr-1" />
							Editar
						</Link>
					</Button>
					<RedirectButton
						href={`/dashboard/festivals/${festivalId}/festival_activities/${activity.id}/review`}
						size="sm"
					>
						<ClipboardListIcon className="w-4 h-4 mr-1" />
						Iniciar revisión
					</RedirectButton>
				</div>
			</CardContent>
		</Card>
	);
}
