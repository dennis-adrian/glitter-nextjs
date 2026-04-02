"use client";

import { ColumnDef } from "@tanstack/react-table";

import { EmailCell } from "@/app/components/dashboard/data_table/cells/email";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import { LiveActActionsCell } from "@/app/components/live_acts/cells/actions-cell";
import { LiveActStatusBadge } from "@/app/components/live_acts/status-badge";
import { LiveAct } from "@/app/lib/live_acts/definitions";

const categoryLabels: Record<LiveAct["category"], string> = {
	music: "Música",
	dance: "Danza",
	talk: "Charla",
};

export const columnTitles = {
	id: "ID",
	actName: "Nombre del acto",
	category: "Categoría",
	contactName: "Contacto",
	contactEmail: "Email",
	contactPhone: "Teléfono",
	status: "Estado",
	resourceLink: "Enlace de referencia",
	socialLinks: "Redes / sitio web",
	createdAt: "Fecha",
};

export const columns: ColumnDef<LiveAct>[] = [
	{
		accessorKey: "id",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title={columnTitles.id} />
		),
	},
	{
		accessorKey: "actName",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title={columnTitles.actName} />
		),
	},
	{
		id: "category",
		accessorKey: "category",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title={columnTitles.category} />
		),
		cell: ({ row }) => categoryLabels[row.original.category],
		filterFn: (row, columnId, filterValues: string[]) => {
			if (filterValues.length === 0) return true;
			return filterValues.includes(row.getValue(columnId));
		},
	},
	{
		accessorKey: "contactName",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title={columnTitles.contactName} />
		),
	},
	{
		id: "contactEmail",
		accessorKey: "contactEmail",
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={columnTitles.contactEmail}
			/>
		),
		cell: ({ row }) => <EmailCell email={row.original.contactEmail} />,
	},
	{
		accessorKey: "contactPhone",
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={columnTitles.contactPhone}
			/>
		),
	},
	{
		id: "status",
		accessorKey: "status",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title={columnTitles.status} />
		),
		cell: ({ row }) => <LiveActStatusBadge status={row.original.status} />,
		filterFn: (row, columnId, filterValues: string[]) => {
			if (filterValues.length === 0) return true;
			return filterValues.includes(row.getValue(columnId));
		},
	},
	{
		id: "resourceLink",
		accessorKey: "resourceLink",
		header: columnTitles.resourceLink,
		cell: ({ row }) => {
			const link = row.original.resourceLink;
			if (!link) return <span className="text-muted-foreground">—</span>;
			const isHttpUrl =
				link.startsWith("http://") || link.startsWith("https://");
			if (isHttpUrl) {
				return (
					<a
						href={link}
						target="_blank"
						rel="noopener noreferrer"
						className="truncate text-blue-500 hover:underline max-w-40 block"
					>
						{link}
					</a>
				);
			}
			return (
				<span className="truncate max-w-40 block">{link}</span>
			);
		},
	},
	{
		id: "socialLinks",
		accessorKey: "socialLinks",
		header: columnTitles.socialLinks,
		cell: ({ row }) => {
			const links = row.original.socialLinks ?? [];
			if (links.length === 0)
				return <span className="text-muted-foreground">—</span>;
			return (
				<div className="flex flex-col gap-1">
					{links.map((link, i) =>
						link.startsWith("http://") || link.startsWith("https://") ? (
							<a
								key={i}
								href={link}
								target="_blank"
								rel="noopener noreferrer"
								className="truncate text-blue-500 hover:underline max-w-40"
							>
								{link}
							</a>
						) : (
							<span key={i} className="truncate max-w-40">
								{link}
							</span>
						),
					)}
				</div>
			);
		},
	},
	{
		id: "createdAt",
		accessorKey: "createdAt",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title={columnTitles.createdAt} />
		),
		cell: ({ row }) =>
			new Date(row.original.createdAt).toLocaleDateString("es-AR"),
	},
	{
		id: "actions",
		cell: ({ row }) => <LiveActActionsCell liveAct={row.original} />,
	},
];
