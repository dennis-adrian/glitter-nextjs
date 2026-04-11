import Link from "next/link";
import { PencilIcon, ClipboardListIcon, ChevronRightIcon } from "lucide-react";

import { RedirectButton } from "@/app/components/redirect-button";
import { Button } from "@/app/components/ui/button";
import CopyActivityLinkButton from "@/app/components/festivals/festival_activities/copy-activity-link-button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/components/ui/card";
import { Progress } from "@/app/components/ui/progress";
import {
	FestivalActivityWithDetailsAndParticipants,
	ParticipantWithUserAndProofs,
} from "@/app/lib/festivals/definitions";
import { getMaterialConfig } from "@/app/lib/festival_activites/helpers";

type ActivitySummaryCardProps = {
	activity: FestivalActivityWithDetailsAndParticipants;
	festivalId: number;
};

type ProofStatusKey =
	| "sin_prueba"
	| "pending_review"
	| "approved"
	| "rejected_resubmit"
	| "rejected_removed";

const PROOF_STATUS_CONFIG: Record<
	ProofStatusKey,
	{ label: string; className: string }
> = {
	pending_review: {
		label: "En revisión",
		className: "text-amber-700 bg-amber-50 border-amber-200",
	},
	rejected_resubmit: {
		label: "Corrección solicitada",
		className: "text-orange-700 bg-orange-50 border-orange-200",
	},
	sin_prueba: {
		label: "Sin material",
		className: "text-muted-foreground bg-muted border-border",
	},
	approved: {
		label: "Aprobada",
		className: "text-emerald-700 bg-emerald-50 border-emerald-200",
	},
	rejected_removed: {
		label: "Removido",
		className: "text-red-700 bg-red-50 border-red-200",
	},
};

// Status display order: actionable first, then resolved
const STATUS_ORDER: ProofStatusKey[] = [
	"pending_review",
	"rejected_resubmit",
	"sin_prueba",
	"approved",
	"rejected_removed",
];

function getParticipantStatus(
	participant: ParticipantWithUserAndProofs,
): ProofStatusKey {
	if (!participant.proofs.length) return "sin_prueba";
	const sorted = [...participant.proofs].sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);
	const canonical =
		sorted.find((p) => p.proofStatus === "pending_review") ?? sorted[0];
	return canonical.proofStatus as ProofStatusKey;
}

function countStatusesForDetail(
	participants: ParticipantWithUserAndProofs[],
): Partial<Record<ProofStatusKey, number>> {
	const counts: Partial<Record<ProofStatusKey, number>> = {};
	for (const p of participants) {
		const status = getParticipantStatus(p);
		counts[status] = (counts[status] ?? 0) + 1;
	}
	return counts;
}

export default function ActivitySummaryCard({
	activity,
	festivalId,
}: ActivitySummaryCardProps) {
	const showVariantHeaders = activity.details.length > 1;
	const detailHref = `/dashboard/festivals/${festivalId}/festival_activities/${activity.id}`;
	const { label: materialLabel } = getMaterialConfig(activity.type);

	return (
		<Card>
			<CardHeader className="pb-2 p-0">
				<Link
					href={detailHref}
					className="flex items-center justify-between gap-2 px-6 py-4 rounded-t-lg hover:bg-muted/50 transition-colors group"
				>
					<CardTitle className="text-base font-semibold leading-tight group-hover:underline">
						{activity.name}
					</CardTitle>
					<ChevronRightIcon className="w-4 h-4 text-muted-foreground shrink-0" />
				</Link>
			</CardHeader>
			<CardContent className="pt-0 space-y-3">
				<div className="space-y-3">
					{activity.details.map((detail, index) => {
						const activeParticipants = detail.participants.filter(
							(p) => !p.removedAt,
						);
						const count = activeParticipants.length;
						const limit = detail.participationLimit;
						const pct = limit ? Math.round((count / limit) * 100) : null;
						const statusCounts = countStatusesForDetail(activeParticipants);

						return (
							<div key={detail.id} className="space-y-1.5">
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
										<span className="text-xs text-muted-foreground">
											{pct}%
										</span>
									)}
								</div>
								{limit && <Progress value={pct ?? 0} className="h-1.5" />}
								{count > 0 && (
									<div className="flex flex-wrap gap-1 pt-0.5">
										{STATUS_ORDER.map((status) => {
											const n = statusCounts[status];
											if (!n) return null;
											const config = PROOF_STATUS_CONFIG[status];
											const label =
												status === "sin_prueba"
													? `sin ${materialLabel}`
													: config.label.toLowerCase();
											return (
												<span
													key={status}
													className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${config.className}`}
												>
													{n} {label}
												</span>
											);
										})}
									</div>
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
					<CopyActivityLinkButton
						festivalId={festivalId}
						activityId={activity.id}
					/>
				</div>
			</CardContent>
		</Card>
	);
}
