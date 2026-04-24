"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { EditIcon } from "lucide-react";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/app/components/ui/popover";
import { StandStatusBadge } from "@/app/components/stands/status-badge";
import { cn } from "@/lib/utils";

import {
	CATEGORY_OPTIONS,
	STAND_STATUS_OPTIONS,
	StandCategory,
	StandStatus,
	formatPrice,
	getCategoryLabel,
	standDisplayLabel,
} from "@/app/components/maps/admin/stand-manage/shared";

export type StandRow = StandWithReservationsWithParticipants & {
	sectorId: number;
	sectorName: string;
};

export const columnTitles = {
	select: "",
	label: "Stand",
	sector: "Sector",
	status: "Estado",
	standCategory: "Categoría",
	price: "Precio",
	reservation: "Reserva",
	actions: "",
};

type ColumnOpts = {
	onEdit: (stand: StandRow) => void;
	onQuickStatus: (stand: StandRow, status: StandStatus) => void;
	pendingQuickStatusId: number | null;
	isSelected: (id: number) => boolean;
	onToggle: (id: number) => void;
	onToggleAll: (ids: number[], allOn: boolean) => void;
};

function StatusCell({
	stand,
	onQuickStatus,
	isPending,
}: {
	stand: StandRow;
	onQuickStatus: (stand: StandRow, status: StandStatus) => void;
	isPending: boolean;
}) {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"inline-flex items-center rounded-md transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
						isPending && "opacity-50",
					)}
					aria-label={`Cambiar estado de ${standDisplayLabel(stand.label, stand.standNumber)}`}
					disabled={isPending}
				>
					<StandStatusBadge status={stand.status} />
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-48 p-1" align="start">
				<div className="flex flex-col gap-0.5">
					{STAND_STATUS_OPTIONS.map((opt) => (
						<button
							key={opt.value}
							type="button"
							onClick={() => onQuickStatus(stand, opt.value)}
							className={cn(
								"flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted",
								stand.status === opt.value && "font-semibold",
							)}
						>
							<StandStatusBadge status={opt.value} />
							{opt.value === stand.status && (
								<span className="ml-auto text-xs text-muted-foreground">
									actual
								</span>
							)}
						</button>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}

export function createColumns({
	onEdit,
	onQuickStatus,
	pendingQuickStatusId,
	isSelected,
	onToggle,
	onToggleAll,
}: ColumnOpts): ColumnDef<StandRow>[] {
	return [
		{
			id: "select",
			header: ({ table }) => {
				const ids = table.getFilteredRowModel().rows.map((r) => r.original.id);
				const allOn = ids.length > 0 && ids.every((id) => isSelected(id));
				const someOn = !allOn && ids.some((id) => isSelected(id));
				return (
					<Checkbox
						checked={allOn ? true : someOn ? "indeterminate" : false}
						onCheckedChange={() => onToggleAll(ids, allOn)}
						aria-label="Seleccionar todos"
					/>
				);
			},
			cell: ({ row }) => (
				<Checkbox
					checked={isSelected(row.original.id)}
					onCheckedChange={() => onToggle(row.original.id)}
					aria-label={`Seleccionar ${standDisplayLabel(row.original.label, row.original.standNumber)}`}
				/>
			),
			enableSorting: false,
			enableHiding: false,
		},
		{
			accessorKey: "label",
			id: "label",
			header: ({ column }) => (
				<DataTableColumnHeader column={column} title={columnTitles.label} />
			),
			accessorFn: (row) => standDisplayLabel(row.label, row.standNumber),
			cell: ({ row }) => {
				const hasReservation = row.original.reservations.length > 0;
				return (
					<div
						className={cn(
							"flex items-center gap-2 pl-2",
							hasReservation && "border-l-4 border-l-emerald-500 -ml-2 py-0.5",
						)}
					>
						<span className="text-sm font-medium">
							{standDisplayLabel(row.original.label, row.original.standNumber)}
						</span>
					</div>
				);
			},
			sortingFn: (a, b) => {
				const an = a.original.standNumber;
				const bn = b.original.standNumber;
				return an - bn || a.original.id - b.original.id;
			},
		},
		{
			accessorKey: "sectorName",
			id: "sector",
			header: ({ column }) => (
				<DataTableColumnHeader column={column} title={columnTitles.sector} />
			),
			cell: ({ row }) => (
				<span className="text-sm">{row.original.sectorName}</span>
			),
			filterFn: (row, _columnId, filterValue: string[]) => {
				if (!filterValue?.length) return true;
				return filterValue.includes(String(row.original.sectorId));
			},
		},
		{
			accessorKey: "status",
			id: "status",
			header: ({ column }) => (
				<DataTableColumnHeader column={column} title={columnTitles.status} />
			),
			cell: ({ row }) => (
				<StatusCell
					stand={row.original}
					onQuickStatus={onQuickStatus}
					isPending={pendingQuickStatusId === row.original.id}
				/>
			),
			filterFn: (row, _columnId, filterValue: string[]) => {
				if (!filterValue?.length) return true;
				return filterValue.includes(row.original.status);
			},
		},
		{
			accessorKey: "standCategory",
			id: "standCategory",
			header: ({ column }) => (
				<DataTableColumnHeader
					column={column}
					title={columnTitles.standCategory}
				/>
			),
			cell: ({ row }) => (
				<span className="text-sm text-muted-foreground">
					{getCategoryLabel(row.original.standCategory as StandCategory)}
				</span>
			),
			filterFn: (row, _columnId, filterValue: string[]) => {
				if (!filterValue?.length) return true;
				return filterValue.includes(row.original.standCategory);
			},
		},
		{
			accessorKey: "price",
			id: "price",
			header: ({ column }) => (
				<DataTableColumnHeader column={column} title={columnTitles.price} />
			),
			cell: ({ row }) => (
				<span className="text-sm tabular-nums">
					{formatPrice(row.original.price ?? 0)}
				</span>
			),
		},
		{
			id: "reservation",
			header: ({ column }) => (
				<DataTableColumnHeader
					column={column}
					title={columnTitles.reservation}
				/>
			),
			accessorFn: (row) => (row.reservations.length > 0 ? "yes" : "no"),
			cell: ({ row }) => {
				const hasReservation = row.original.reservations.length > 0;
				return hasReservation ? (
					<Badge variant="secondary" className="text-xs">
						Con reserva
					</Badge>
				) : (
					<span className="text-xs text-muted-foreground">—</span>
				);
			},
			filterFn: (row, _columnId, filterValue: string[]) => {
				if (!filterValue?.length) return true;
				const has = row.original.reservations.length > 0 ? "yes" : "no";
				return filterValue.includes(has);
			},
			enableSorting: false,
		},
		{
			id: "actions",
			header: () => null,
			cell: ({ row }) => (
				<div className="flex justify-end">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => onEdit(row.original)}
						aria-label={`Editar ${standDisplayLabel(row.original.label, row.original.standNumber)}`}
					>
						<EditIcon className="mr-1 h-4 w-4" />
						Editar
					</Button>
				</div>
			),
			enableSorting: false,
			enableHiding: false,
		},
	];
}

export function standFilterOptions() {
	return {
		status: STAND_STATUS_OPTIONS.map((o) => ({
			value: o.value,
			label: o.label,
		})),
		category: CATEGORY_OPTIONS.map((o) => ({
			value: o.value,
			label: o.label,
		})),
		reservation: [
			{ value: "yes", label: "Con reserva" },
			{ value: "no", label: "Sin reserva" },
		],
	};
}
