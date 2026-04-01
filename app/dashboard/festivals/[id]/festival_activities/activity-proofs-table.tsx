"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/app/components/ui/badge";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { Button } from "@/app/components/ui/button";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { toast } from "sonner";
import type {
	FestivalActivityDetail,
	ParticipantWithUserAndProofs,
} from "@/app/lib/festivals/definitions";
import type { FestivalActivity } from "@/app/lib/festivals/definitions";
import { getCategoryLabel } from "@/app/lib/maps/helpers";
import { reviewActivityParticipantProof } from "@/app/lib/festival_activites/admin-actions";
import { getMaterialConfig } from "@/app/lib/festival_activites/helpers";
import { cn } from "@/app/lib/utils";
import ProofImageModal from "./proof-image-modal";
import RejectProofModal from "./reject-proof-modal";
import RemoveParticipantModal from "@/app/components/festivals/festival_activities/remove-participant-modal";
import RestoreParticipantButton from "@/app/components/festivals/festival_activities/restore-participant-button";

/** Detail fields needed for proof review rows (avoids duplicating full detail + participants per row). */
type ProofRowDetail = Pick<FestivalActivityDetail, "id" | "category">;

type ParticipantWithDetail = ParticipantWithUserAndProofs & {
	detail: ProofRowDetail;
	removedAt: Date | null;
};

function selectCanonicalProof(participant: ParticipantWithDetail) {
	if (!participant.proofs.length) return null;

	const sortedByCreatedAtDesc = [...participant.proofs].sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);
	return (
		sortedByCreatedAtDesc.find(
			(proof) => proof.proofStatus === "pending_review",
		) ??
		sortedByCreatedAtDesc[0] ??
		null
	);
}

function ApproveProofButton({
	proofId,
	materialLabel,
	className,
}: {
	proofId: number;
	materialLabel: string;
	className?: string;
}) {
	const [isApproving, setIsApproving] = useState(false);
	const approvingRef = useRef(false);
	const router = useRouter();

	const handleApprove = async () => {
		if (approvingRef.current) return;
		approvingRef.current = true;
		setIsApproving(true);
		try {
			const result = await reviewActivityParticipantProof(proofId, "approved");
			if (result.success) {
				toast.success(result.message);
				router.refresh();
			} else {
				toast.error(result.message);
			}
		} catch {
			toast.error(`No se pudo aprobar el ${materialLabel}. Intentá nuevamente.`);
		} finally {
			approvingRef.current = false;
			setIsApproving(false);
		}
	};

	return (
		<Button
			variant="outline"
			size="sm"
			disabled={isApproving}
			className={cn(
				"h-7 px-2 text-xs text-emerald-700 border-emerald-300",
				className,
			)}
			onClick={handleApprove}
		>
			{isApproving ? (
				<span className="inline-flex items-center gap-1.5">
					<Loader2Icon className="h-3 w-3 animate-spin" aria-hidden />
					Aprobando
				</span>
			) : (
				"Aprobar"
			)}
		</Button>
	);
}

const PROOF_STATUS_BADGE: Record<string, { label: string; className: string }> =
	{
		pending_review: {
			label: "En revisión",
			className: "bg-amber-50 text-amber-800 border-amber-300",
		},
		approved: {
			label: "Aprobada",
			className: "bg-emerald-100 text-emerald-800 border-emerald-200",
		},
		rejected_resubmit: {
			label: "Corrección solicitada",
			className: "bg-orange-100 text-orange-800 border-orange-300",
		},
		rejected_removed: {
			label: "Removido",
			className: "bg-red-100 text-red-800 border-red-300",
		},
	};

function buildColumns(
	proofType: FestivalActivity["proofType"],
	materialLabel: string,
): ColumnDef<ParticipantWithDetail>[] {
	const showImage = proofType === "image" || proofType === "both";
	const showText = proofType === "text" || proofType === "both";

	return [
		{
			id: "index",
			header: "#",
			cell: ({ row }) => (
				<span className="text-muted-foreground text-sm">{row.index + 1}</span>
			),
			size: 40,
		},
		{
			id: "participant",
			header: "Participante",
			accessorFn: (row) => row.user.displayName ?? "",
			cell: ({ row }) => {
				const user = row.original.user;
				const isRemoved = row.original.removedAt !== null;
				return (
					<div className="flex items-center gap-2">
						<Avatar className="w-7 h-7 shrink-0">
							<AvatarImage
								src={
									user.imageUrl || "/img/placeholders/avatar-placeholder.png"
								}
								alt={user.displayName ?? "Avatar"}
							/>
						</Avatar>
						<span
							className={`font-medium text-sm truncate max-w-[160px] ${isRemoved ? "line-through text-muted-foreground" : ""}`}
						>
							{user.displayName ?? "—"}
						</span>
					</div>
				);
			},
		},
		{
			id: "category",
			header: "Categoría",
			accessorFn: (row) => {
				const cat = row.detail.category;
				return cat ? getCategoryLabel(cat) : "Todas";
			},
			cell: ({ getValue }) => (
				<span className="text-sm text-muted-foreground">
					{getValue() as string}
				</span>
			),
		},
		{
			id: "submittedAt",
			header: "Enviada el",
			accessorFn: (row) => selectCanonicalProof(row)?.createdAt ?? null,
			cell: ({ row }) => {
				const date = selectCanonicalProof(row.original)?.createdAt;
				if (!date)
					return <span className="text-muted-foreground text-sm">—</span>;
				return (
					<span className="text-sm">
						{new Date(date).toLocaleDateString("es-ES", {
							day: "numeric",
							month: "short",
							year: "numeric",
						})}
					</span>
				);
			},
		},
		{
			id: "proofStatus",
			header: "Estado",
			accessorFn: (row) =>
				selectCanonicalProof(row)?.proofStatus ?? "sin_prueba",
			cell: ({ row }) => {
				const proof = selectCanonicalProof(row.original);
				if (!proof) {
					return (
						<Badge variant="outline" className="text-muted-foreground text-xs">
							Sin {materialLabel}
						</Badge>
					);
				}
				const config = PROOF_STATUS_BADGE[proof.proofStatus];
				if (!config) {
					return (
						<Badge variant="outline" className="text-xs text-muted-foreground">
							{proof.proofStatus}
						</Badge>
					);
				}
				return (
					<Badge variant="outline" className={`text-xs ${config.className}`}>
						{config.label}
					</Badge>
				);
			},
			filterFn: (row, _, filterValue) => {
				const status =
					selectCanonicalProof(row.original)?.proofStatus ?? "sin_prueba";
				const selected = Array.isArray(filterValue)
					? (filterValue as string[])
					: typeof filterValue === "string"
						? [filterValue]
						: [];
				if (!selected.length || selected.includes("all")) return true;
				return selected.includes(status);
			},
		},
		...(showText
			? [
					{
						id: "promo",
						header: "Promoción",
						cell: ({ row }: { row: { original: ParticipantWithDetail } }) => {
							const proof = selectCanonicalProof(row.original);
							if (
								!proof?.promoHighlight &&
								!proof?.promoDescription &&
								!proof?.promoConditions
							)
								return <span className="text-muted-foreground text-sm">—</span>;
							return (
								<div className="max-w-[200px] space-y-0.5">
									{proof.promoHighlight && (
										<p
											className="text-sm font-semibold truncate"
											title={proof.promoHighlight}
										>
											{proof.promoHighlight}
										</p>
									)}
									{proof.promoDescription && (
										<p
											className="text-sm truncate"
											title={proof.promoDescription}
										>
											{proof.promoDescription}
										</p>
									)}
									{proof.promoConditions && (
										<p
											className="text-xs text-muted-foreground truncate"
											title={proof.promoConditions}
										>
											{proof.promoConditions}
										</p>
									)}
								</div>
							);
						},
					} as ColumnDef<ParticipantWithDetail>,
				]
			: []),
		{
			id: "actions",
			header: "",
			cell: ({ row }) => {
				const proof = selectCanonicalProof(row.original);
				const participantName = row.original.user.displayName ?? "Participante";
				const isRemoved = row.original.removedAt !== null;

				return (
					<div className="flex items-center gap-1">
						{showImage && proof?.imageUrl && (
							<ProofImageModal
								imageUrl={proof.imageUrl}
								participantName={participantName}
								materialLabel={materialLabel}
							/>
						)}
						{proof && proof.proofStatus === "pending_review" && (
							<>
								<ApproveProofButton
									proofId={proof.id}
									materialLabel={materialLabel}
									className="hover:bg-emerald-50"
								/>
								<RejectProofModal
									proofId={proof.id}
									mode="resubmit"
									participantName={participantName}
									materialLabel={materialLabel}
								/>
								<RejectProofModal
									proofId={proof.id}
									mode="remove"
									participantName={participantName}
									materialLabel={materialLabel}
								/>
							</>
						)}
						{!isRemoved && !proof && (
							<RemoveParticipantModal
								participationId={row.original.id}
								participantName={participantName}
							/>
						)}
						{isRemoved && (
							<RestoreParticipantButton participationId={row.original.id} />
						)}
					</div>
				);
			},
		},
	];
}

type ActivityProofsTableProps = {
	participants: ParticipantWithDetail[];
	activity: FestivalActivity;
};

export default function ActivityProofsTable({
	participants,
	activity,
}: ActivityProofsTableProps) {
	const proofType = activity.proofType;
	const showText = proofType === "text" || proofType === "both";
	const showImage = proofType === "image" || proofType === "both";
	const { label: materialLabel } = getMaterialConfig(activity.type);
	const columns = buildColumns(proofType, materialLabel);

	if (participants.length === 0) {
		return (
			<p className="text-sm text-muted-foreground py-2">
				No hay participantes inscriptos aún.
			</p>
		);
	}

	return (
		<>
			{/* Desktop: DataTable */}
			<div className="hidden md:block">
				<DataTable
					columns={columns}
					data={participants}
					columnTitles={{
						index: "#",
						participant: "Participante",
						category: "Categoría",
						submittedAt: "Enviada el",
						proofStatus: "Estado",
						promo: "Promoción",
						actions: "Acciones",
					}}
					filters={[
						{
							columnId: "proofStatus",
							label: "Estado",
							options: [
								{ value: "pending_review", label: "En revisión" },
								{ value: "approved", label: "Aprobada" },
								{ value: "rejected_resubmit", label: "Corrección solicitada" },
								{ value: "rejected_removed", label: "Removido" },
							],
						},
					]}
				/>
			</div>

			{/* Mobile: stacked cards */}
			<div className="md:hidden space-y-2">
				{participants.map((participant, index) => {
					const proof = selectCanonicalProof(participant);
					const category = participant.detail.category;
					const isRemoved = participant.removedAt !== null;
					const statusConfig = proof
						? (PROOF_STATUS_BADGE[proof.proofStatus] ?? null)
						: null;

					return (
						<div
							key={participant.id}
							className={`rounded-md border p-3 space-y-2 ${isRemoved ? "opacity-60" : ""}`}
						>
							<div className="flex items-center justify-between gap-3">
								<div className="flex items-center gap-3 min-w-0">
									<span className="text-xs text-muted-foreground shrink-0">
										{index + 1}
									</span>
									<Avatar className="w-8 h-8 shrink-0">
										<AvatarImage
											src={
												participant.user.imageUrl ||
												"/img/placeholders/avatar-placeholder.png"
											}
											alt={participant.user.displayName ?? "Avatar"}
										/>
									</Avatar>
									<div className="min-w-0">
										<p
											className={`text-sm font-medium truncate ${isRemoved ? "line-through text-muted-foreground" : ""}`}
										>
											{participant.user.displayName ?? "—"}
										</p>
										{category && (
											<p className="text-xs text-muted-foreground">
												{getCategoryLabel(category)}
											</p>
										)}
									</div>
								</div>
								{statusConfig ? (
									<Badge
										variant="outline"
										className={`text-xs shrink-0 ${statusConfig.className}`}
									>
										{statusConfig.label}
									</Badge>
								) : (
									<Badge
										variant="outline"
										className="text-xs text-muted-foreground shrink-0"
									>
										Sin {materialLabel}
									</Badge>
								)}
							</div>

							{showText &&
								(proof?.promoHighlight ||
									proof?.promoDescription ||
									proof?.promoConditions) && (
									<div className="pl-10 space-y-0.5">
										{proof.promoHighlight && (
											<p className="text-sm font-semibold">
												{proof.promoHighlight}
											</p>
										)}
										{proof.promoDescription && (
											<p className="text-sm">{proof.promoDescription}</p>
										)}
										{proof.promoConditions && (
											<p className="text-xs text-muted-foreground">
												{proof.promoConditions}
											</p>
										)}
									</div>
								)}

							{proof && (
								<div className="flex items-center gap-2 pl-10 flex-wrap">
									{showImage && proof.imageUrl && (
										<ProofImageModal
											imageUrl={proof.imageUrl}
											participantName={
												participant.user.displayName ?? "Participante"
											}
											materialLabel={materialLabel}
										/>
									)}
									{proof.proofStatus === "pending_review" && (
										<>
											<ApproveProofButton
												proofId={proof.id}
												materialLabel={materialLabel}
											/>
											<RejectProofModal
												proofId={proof.id}
												mode="resubmit"
												participantName={
													participant.user.displayName ?? "Participante"
												}
												materialLabel={materialLabel}
											/>
											<RejectProofModal
												proofId={proof.id}
												mode="remove"
												participantName={
													participant.user.displayName ?? "Participante"
												}
												materialLabel={materialLabel}
											/>
										</>
									)}
								</div>
							)}
							{!isRemoved && !proof && (
								<div className="pl-10">
									<RemoveParticipantModal
										participationId={participant.id}
										participantName={
											participant.user.displayName ?? "Participante"
										}
									/>
								</div>
							)}
							{isRemoved && (
								<div className="pl-10">
									<RestoreParticipantButton participationId={participant.id} />
								</div>
							)}
						</div>
					);
				})}
			</div>
		</>
	);
}
