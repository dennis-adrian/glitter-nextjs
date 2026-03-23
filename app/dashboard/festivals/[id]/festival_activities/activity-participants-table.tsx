"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/app/components/ui/badge";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import {
	ActivityDetailsWithParticipants,
	ParticipantWithUserAndProofs,
} from "@/app/lib/festivals/definitions";
import { getCategoryLabel } from "@/app/lib/maps/helpers";
import ProofImageModal from "./proof-image-modal";
import TextProofModal from "./text-proof-modal";

type ParticipantWithDetail = ParticipantWithUserAndProofs & {
	detail: ActivityDetailsWithParticipants;
};

function ParticipantProofViewer({
	proof,
	participantName,
}: {
	proof: ParticipantWithUserAndProofs["proofs"][number];
	participantName: string;
}) {
	const hasImage = Boolean(proof.imageUrl);
	const hasText =
		Boolean(proof.promoDescription && proof.promoDescription.trim()) ||
		Boolean(proof.promoConditions && proof.promoConditions.trim());

	if (hasImage && hasText) {
		return (
			<>
				<ProofImageModal
					imageUrl={proof.imageUrl}
					participantName={participantName}
				/>
				<TextProofModal
					participantName={participantName}
					promoDescription={proof.promoDescription}
					promoConditions={proof.promoConditions}
				/>
			</>
		);
	}

	if (hasImage) {
		return (
			<ProofImageModal
				imageUrl={proof.imageUrl}
				participantName={participantName}
			/>
		);
	}

	if (!hasText) return null;

	return (
		<TextProofModal
			participantName={participantName}
			promoDescription={proof.promoDescription}
			promoConditions={proof.promoConditions}
		/>
	);
}

const COLUMN_TITLES: Record<string, string> = {
	index: "#",
	participant: "Participante",
	category: "Categoría",
	enrolledAt: "Inscrito el",
	proof: "Prueba",
	actions: "Acciones",
};

/** Synthetic key when the participant has not submitted a proof row yet. */
const PROOF_STATUS_BADGE: Record<string, { label: string; className: string }> =
	{
		sin_prueba: {
			label: "Pendiente",
			className: "text-amber-700 border-amber-300 bg-amber-50",
		},
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

function proofStatusKey(
	proof: ParticipantWithUserAndProofs["proofs"][number] | undefined,
) {
	return proof?.proofStatus ?? "sin_prueba";
}

const columns: ColumnDef<ParticipantWithDetail>[] = [
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
			return (
				<div className="flex items-center gap-2">
					<Avatar className="w-7 h-7 shrink-0">
						<AvatarImage
							src={user.imageUrl || "/img/placeholders/avatar-placeholder.png"}
							alt={user.displayName ?? "Avatar"}
						/>
					</Avatar>
					<span className="font-medium text-sm truncate max-w-[160px]">
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
		filterFn: "equalsString",
	},
	{
		id: "enrolledAt",
		header: "Inscrito el",
		accessorFn: (row) => row.createdAt,
		cell: ({ row }) =>
			new Date(row.original.createdAt).toLocaleDateString("es-ES", {
				day: "numeric",
				month: "short",
				year: "numeric",
			}),
		sortingFn: "datetime",
	},
	{
		id: "proof",
		header: "Prueba",
		accessorFn: (row) => proofStatusKey(row.proofs[0]),
		cell: ({ row }) => {
			const proof = row.original.proofs[0];
			const key = proofStatusKey(proof);
			const config = PROOF_STATUS_BADGE[key] ?? PROOF_STATUS_BADGE.sin_prueba;
			return (
				<Badge variant="outline" className={`text-xs ${config.className}`}>
					{config.label}
				</Badge>
			);
		},
		filterFn: (row, _, filterValue) => {
			const selected = filterValue as string[] | undefined;
			if (!selected?.length) return true;
			const key = proofStatusKey(row.original.proofs[0]);
			return selected.includes(key);
		},
	},
	{
		id: "actions",
		header: "",
		cell: ({ row }) => {
			const proof = row.original.proofs[0];
			if (!proof) return null;
			return (
				<ParticipantProofViewer
					proof={proof}
					participantName={row.original.user.displayName ?? "Participante"}
				/>
			);
		},
	},
];

type ActivityParticipantsTableProps = {
	participants: ParticipantWithDetail[];
};

export default function ActivityParticipantsTable({
	participants,
}: ActivityParticipantsTableProps) {
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
					columnTitles={COLUMN_TITLES}
					filters={[
						{
							columnId: "proof",
							label: "Prueba",
							options: [
								{ value: "sin_prueba", label: "Pendiente (sin enviar)" },
								{ value: "pending_review", label: "En revisión" },
								{ value: "approved", label: "Aprobada" },
								{
									value: "rejected_resubmit",
									label: "Corrección solicitada",
								},
								{ value: "rejected_removed", label: "Removido" },
							],
						},
					]}
				/>
			</div>

			{/* Mobile: stacked cards */}
			<div className="md:hidden space-y-2">
				{participants.map((participant, index) => {
					const proof = participant.proofs[0];
					const statusKey = proofStatusKey(proof);
					const statusBadge =
						PROOF_STATUS_BADGE[statusKey] ?? PROOF_STATUS_BADGE.sin_prueba;
					const category = participant.detail.category;

					return (
						<div
							key={participant.id}
							className="flex items-center justify-between rounded-md border p-3 gap-3"
						>
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
									<p className="text-sm font-medium truncate">
										{participant.user.displayName ?? "—"}
									</p>
									{category && (
										<p className="text-xs text-muted-foreground">
											{getCategoryLabel(category)}
										</p>
									)}
								</div>
							</div>
							<div className="flex items-center gap-2 shrink-0">
								<Badge
									variant="outline"
									className={`text-xs shrink-0 ${statusBadge.className}`}
								>
									{statusBadge.label}
								</Badge>
								{proof && (
									<ParticipantProofViewer
										proof={proof}
										participantName={
											participant.user.displayName ?? "Participante"
										}
									/>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</>
	);
}
