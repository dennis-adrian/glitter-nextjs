"use client";

import { Button } from "@/app/components/ui/button";
import DeleteQrCodeModal from "@/app/components/organisms/qr_codes/delete-qr-code-modal";
import QrCodeImagePreview from "@/app/components/organisms/qr_codes/qr-code-image-preview";
import QrCodeStatusBadge from "@/app/components/organisms/qr_codes/status-badge";
import type { QrCodeBase } from "@/app/lib/qr_codes/definitions";
import { getQrCodeStatus } from "@/app/lib/qr_codes/status";
import { ColumnDef } from "@tanstack/react-table";
import { Trash2Icon } from "lucide-react";
import { DateTime } from "luxon";
import Link from "next/link";
import { useState } from "react";

export const columnTitles: Record<string, string> = {
	image: "QR",
	amount: "Monto",
	expirationDate: "Vencimiento",
	status: "Estado",
	actions: "Acciones",
};

function formatExpiration(date: Date) {
	const dt = DateTime.fromJSDate(new Date(date)).setLocale("es");
	const absolute = dt.toFormat("dd/MM/yyyy");
	const relative = dt.toRelative({ base: DateTime.now() }) ?? "";
	return { absolute, relative };
}

function ActionsCell({ qrCode }: { qrCode: QrCodeBase }) {
	const [open, setOpen] = useState(false);
	return (
		<div className="flex items-center gap-2">
			<Button asChild size="sm" variant="outline">
				<Link href={`/dashboard/qr_codes/${qrCode.id}/edit`}>Editar</Link>
			</Button>
			<Button
				size="sm"
				variant="ghost"
				onClick={() => setOpen(true)}
				aria-label="Eliminar código QR"
			>
				<Trash2Icon className="h-4 w-4 text-destructive" />
			</Button>
			<DeleteQrCodeModal qrCode={qrCode} open={open} setOpen={setOpen} />
		</div>
	);
}

export const columns: ColumnDef<QrCodeBase>[] = [
	{
		id: "image",
		header: columnTitles.image,
		cell: ({ row }) => <QrCodeImagePreview imageUrl={row.original.qrCodeUrl} />,
		enableSorting: false,
	},
	{
		id: "amount",
		accessorKey: "amount",
		header: columnTitles.amount,
		cell: ({ row }) => `Bs ${row.original.amount.toFixed(2)}`,
	},
	{
		id: "expirationDate",
		accessorKey: "expirationDate",
		header: columnTitles.expirationDate,
		cell: ({ row }) => {
			const { absolute, relative } = formatExpiration(
				row.original.expirationDate,
			);
			return (
				<div className="flex flex-col">
					<span>{absolute}</span>
					<span className="text-xs text-muted-foreground">{relative}</span>
				</div>
			);
		},
		sortingFn: (a, b) =>
			new Date(a.original.expirationDate).getTime() -
			new Date(b.original.expirationDate).getTime(),
	},
	{
		id: "status",
		header: columnTitles.status,
		cell: ({ row }) => (
			<QrCodeStatusBadge
				status={getQrCodeStatus(row.original.expirationDate)}
			/>
		),
		enableSorting: false,
	},
	{
		id: "actions",
		header: columnTitles.actions,
		cell: ({ row }) => <ActionsCell qrCode={row.original} />,
		enableSorting: false,
	},
];
