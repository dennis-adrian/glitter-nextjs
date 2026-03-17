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

type ParticipantWithDetail = ParticipantWithUserAndProofs & {
	detail: ActivityDetailsWithParticipants;
};

const COLUMN_TITLES: Record<string, string> = {
	index: "#",
	participant: "Participante",
	category: "Categoría",
	enrolledAt: "Inscrito el",
	proof: "Prueba",
	actions: "Acciones",
};

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
		cell: ({ row }) => {
			const hasProof = row.original.proofs.length > 0;
			return (
				<Badge
					variant={hasProof ? "default" : "outline"}
					className={
						hasProof
							? "bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
							: "text-amber-700 border-amber-300 bg-amber-50"
					}
				>
					{hasProof ? "Subida" : "Pendiente"}
				</Badge>
			);
		},
		filterFn: (row, _, filterValue) => {
			const hasProof = row.original.proofs.length > 0;
			if (filterValue === "uploaded") return hasProof;
			if (filterValue === "pending") return !hasProof;
			return true;
		},
	},
	{
		id: "actions",
		header: "",
		cell: ({ row }) => {
			const proof = row.original.proofs[0];
			if (!proof) return null;
			return (
				<ProofImageModal
					imageUrl={proof.imageUrl}
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
								{ value: "uploaded", label: "Subida" },
								{ value: "pending", label: "Pendiente" },
							],
						},
					]}
				/>
			</div>

			{/* Mobile: stacked cards */}
			<div className="md:hidden space-y-2">
				{participants.map((participant, index) => {
					const hasProof = participant.proofs.length > 0;
					const proof = participant.proofs[0];
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
									variant={hasProof ? "default" : "outline"}
									className={
										hasProof
											? "bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 text-xs"
											: "text-amber-700 border-amber-300 bg-amber-50 text-xs"
									}
								>
									{hasProof ? "Subida" : "Pendiente"}
								</Badge>
								{proof && (
									<ProofImageModal
										imageUrl={proof.imageUrl}
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
