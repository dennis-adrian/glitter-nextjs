import { fetchFestivalActivityForReview } from "@/app/lib/festivals/actions";
import { Button } from "@/app/components/ui/button";
import Link from "next/link";
import { BookOpenIcon } from "lucide-react";
import { notFound } from "next/navigation";
import { z } from "zod";
import ActivityProofsTable from "../../activity-proofs-table";
import ExportProofsButton from "./export-proofs-button";

const ParamsSchema = z.object({
	id: z.coerce.number(),
	activityId: z.coerce.number(),
});

type ReviewPageProps = {
	params: Promise<z.infer<typeof ParamsSchema>>;
};

export default async function Page({ params }: ReviewPageProps) {
	const validatedParams = ParamsSchema.safeParse(await params);
	if (!validatedParams.success) return notFound();

	const activity = await fetchFestivalActivityForReview(
		validatedParams.data.id,
		validatedParams.data.activityId,
	);

	if (!activity) return notFound();

	const allParticipants = activity.details.flatMap((detail) =>
		detail.participants.map((p) => ({
			...p,
			detail: { id: detail.id, category: detail.category },
			removedAt: p.removedAt,
		})),
	);

	const showExport =
		activity.proofType === "text" || activity.proofType === "both";

	const approvedPromos = showExport
		? allParticipants
				.filter((p) => {
					const firstProof = p.proofs?.[0];
					return firstProof?.proofStatus === "approved";
				})
				.map((p) => {
					const firstProof = p.proofs?.[0];
					return {
					name: p.user.displayName ?? "—",
					promoDescription: firstProof?.promoDescription ?? "",
					promoConditions: firstProof?.promoConditions ?? null,
				};
				})
		: [];

	return (
		<div className="container p-3 md:p-6 space-y-4">
			<div className="flex items-center justify-between gap-4 flex-wrap">
				<h1 className="text-lg md:text-xl font-bold">
					Revisión de pruebas — {activity.name}
				</h1>
				{showExport && (
					<div className="flex gap-2">
						<ExportProofsButton approvedPromos={approvedPromos} />
						<Button asChild variant="outline" size="sm">
							<Link href="./couponbook">
								<BookOpenIcon className="w-4 h-4 mr-1" />
								Ver cuponera
							</Link>
						</Button>
					</div>
				)}
			</div>

			{activity.details.map((detail, index) => {
				const variantParticipants = detail.participants.map((p) => ({
					...p,
					detail: { id: detail.id, category: detail.category },
					removedAt: p.removedAt,
				}));
				const activeParticipants = variantParticipants.filter(
					(participant) => !participant.removedAt,
				);
				const limitLabel = detail.participationLimit
					? `${activeParticipants.length}/${detail.participationLimit}`
					: `${activeParticipants.length}`;
				const showHeader = activity.details.length > 1;

				return (
					<div key={detail.id} className="flex flex-col gap-2">
						{showHeader && (
							<h3 className="text-sm font-semibold text-muted-foreground">
								Variante {index + 1}
								{detail.description ? ` — ${detail.description}` : ""}
								{" "}· {limitLabel} participante
								{activeParticipants.length !== 1 ? "s" : ""}
							</h3>
						)}
						<ActivityProofsTable participants={variantParticipants} activity={activity} />
					</div>
				);
			})}
		</div>
	);
}
