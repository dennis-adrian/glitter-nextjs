"use client";

import { useRef, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { WaitlistEntryWithUser } from "@/app/lib/festivals/definitions";
import { notifyWaitlistEntry } from "@/app/lib/festival_activites/admin-actions";

const COLUMN_TITLES: Record<string, string> = {
	position: "#",
	participant: "Participante",
	status: "Estado",
	expires: "Vence",
	actions: "Acciones",
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
	waiting: {
		label: "En espera",
		className: "text-gray-700 border-gray-300 bg-gray-50",
	},
	invited: {
		label: "Invitado",
		className: "text-amber-700 border-amber-300 bg-amber-50",
	},
	expired: {
		label: "Invitación vencida",
		className: "text-red-700 border-red-300 bg-red-50",
	},
};

function getStatus(
	entry: WaitlistEntryWithUser,
): "waiting" | "invited" | "expired" {
	if (!entry.notifiedAt) return "waiting";
	if (entry.expiresAt && new Date() < new Date(entry.expiresAt))
		return "invited";
	return "expired";
}

function NotifyWaitlistButton({
	entry,
	festivalId,
	status,
}: {
	entry: WaitlistEntryWithUser;
	festivalId: number;
	status: "waiting" | "expired";
}) {
	const [isLoading, setIsLoading] = useState(false);
	const pendingRef = useRef(false);

	const handleNotify = async () => {
		if (pendingRef.current) return;
		pendingRef.current = true;
		setIsLoading(true);
		try {
			const result = await notifyWaitlistEntry(entry.id, festivalId);
			if (result.success) {
				toast.success(result.message);
			} else {
				toast.error(result.message);
			}
		} finally {
			pendingRef.current = false;
			setIsLoading(false);
		}
	};

	return (
		<Button
			size="sm"
			variant="outline"
			disabled={isLoading}
			onClick={handleNotify}
		>
			{status === "expired" ? "Re-notificar" : "Notificar"}
		</Button>
	);
}

function buildColumns(festivalId: number): ColumnDef<WaitlistEntryWithUser>[] {
	return [
		{
			id: "position",
			header: "#",
			cell: ({ row }) => (
				<span className="text-sm font-medium text-muted-foreground">
					{row.original.position}
				</span>
			),
		},
		{
			id: "participant",
			header: "Participante",
			cell: ({ row }) => {
				const user = row.original.user;
				return (
					<div className="flex items-center gap-2">
						<Avatar className="w-7 h-7">
							<AvatarImage
								src={
									user.imageUrl ||
									"/img/placeholders/avatar-placeholder.png"
								}
								alt={user.displayName || ""}
							/>
						</Avatar>
						<span className="text-sm font-medium">{user.displayName}</span>
					</div>
				);
			},
		},
		{
			id: "status",
			header: "Estado",
			cell: ({ row }) => {
				const status = getStatus(row.original);
				const config = STATUS_BADGE[status];
				return (
					<Badge variant="outline" className={config.className}>
						{config.label}
					</Badge>
				);
			},
		},
		{
			id: "expires",
			header: "Vence",
			cell: ({ row }) => {
				const { expiresAt, notifiedAt } = row.original;
				if (!notifiedAt || !expiresAt)
					return (
						<span className="text-muted-foreground">—</span>
					);
				return (
					<span className="text-sm text-muted-foreground">
						{new Date(expiresAt).toLocaleString("es-ES", {
							day: "numeric",
							month: "short",
							hour: "2-digit",
							minute: "2-digit",
						})}
					</span>
				);
			},
		},
		{
			id: "actions",
			header: "Acciones",
			cell: ({ row }) => {
				const status = getStatus(row.original);
				if (status === "invited") return null;
				return (
					<NotifyWaitlistButton
						entry={row.original}
						festivalId={festivalId}
						status={status}
					/>
				);
			},
		},
	];
}

type ActivityWaitlistTableProps = {
	entries: WaitlistEntryWithUser[];
	festivalId: number;
};

export default function ActivityWaitlistTable({
	entries,
	festivalId,
}: ActivityWaitlistTableProps) {
	const columns = buildColumns(festivalId);
	return (
		<DataTable
			columns={columns}
			data={entries}
			columnTitles={COLUMN_TITLES}
		/>
	);
}
