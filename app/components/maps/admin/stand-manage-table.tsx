"use client";

import { ListTree } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
	useCallback,
	useEffect,
	useMemo,
	useOptimistic,
	useState,
	useTransition,
} from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import { bulkUpdateStands } from "@/app/api/stands/actions";
import {
	StandBase,
	StandWithReservationsWithParticipants,
} from "@/app/api/stands/definitions";
import { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { Tabs, TabsList, TabsTrigger } from "@/app/components/ui/tabs";

import StandBulkActionsMenu from "@/app/components/maps/admin/stand-manage/bulk-actions-menu";
import StandManageCardList from "@/app/components/maps/admin/stand-manage/card-list";
import {
	StandRow,
	columnTitles,
	createColumns,
	standFilterOptions,
} from "@/app/components/maps/admin/stand-manage/columns";
import StandEditFormDialog from "@/app/components/maps/admin/stand-manage/edit-form-dialog";
import {
	STAND_STATUS_OPTIONS,
	StandCategory,
	StandStatus,
	getStatusLabel,
} from "@/app/components/maps/admin/stand-manage/shared";

type Sector = FestivalSectorWithStandsWithReservationsWithParticipants;

type Props = {
	festivalId: number;
	festivalName: string;
	sectors: Sector[];
};

const ALL_SECTOR_VALUE = "all";

function patchSectors(
	sectors: Sector[],
	ids: Set<number>,
	patch: Partial<StandBase>,
): Sector[] {
	return sectors.map((s) => ({
		...s,
		stands: s.stands.map((st) =>
			ids.has(st.id) ? ({ ...st, ...patch } as typeof st) : st,
		),
	}));
}

function countByStatus(stands: StandWithReservationsWithParticipants[]) {
	return stands.reduce(
		(acc, s) => {
			acc[s.status as StandStatus] = (acc[s.status as StandStatus] ?? 0) + 1;
			return acc;
		},
		{} as Record<StandStatus, number>,
	);
}

export default function StandManageTable({
	festivalId,
	festivalName,
	sectors,
}: Props) {
	const router = useRouter();
	const searchParams = useSearchParams();

	const [liveSectors, setLiveSectors] = useState(sectors);
	useEffect(() => {
		setLiveSectors(sectors);
	}, [sectors]);

	const urlSector = searchParams.get("sector") ?? ALL_SECTOR_VALUE;
	const activeTab = useMemo(() => {
		if (urlSector === ALL_SECTOR_VALUE) return ALL_SECTOR_VALUE;
		return liveSectors.some((s) => String(s.id) === urlSector)
			? urlSector
			: ALL_SECTOR_VALUE;
	}, [urlSector, liveSectors]);

	const [isTabPending, startTabTransition] = useTransition();
	const [optimisticTab, setOptimisticTab] = useOptimistic(activeTab);

	const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
	const [editStand, setEditStand] =
		useState<StandWithReservationsWithParticipants | null>(null);
	const [editOpen, setEditOpen] = useState(false);
	const [pendingQuickStatusId, setPendingQuickStatusId] = useState<
		number | null
	>(null);

	const allRows: StandRow[] = useMemo(() => {
		const out: StandRow[] = [];
		for (const sector of liveSectors) {
			for (const stand of sector.stands) {
				out.push({
					...stand,
					sectorId: sector.id,
					sectorName: sector.name,
				});
			}
		}
		return out;
	}, [liveSectors]);

	const rowsForTab = useMemo(() => {
		if (optimisticTab === ALL_SECTOR_VALUE) return allRows;
		const sectorId = Number(optimisticTab);
		return allRows.filter((r) => r.sectorId === sectorId);
	}, [allRows, optimisticTab]);

	const rowsById = useMemo(() => {
		const m = new Map<number, StandRow>();
		for (const r of allRows) m.set(r.id, r);
		return m;
	}, [allRows]);

	const selectedIdsArr = useMemo(() => Array.from(selectedIds), [selectedIds]);

	const selectedHaveReservation = useMemo(() => {
		for (const id of selectedIds) {
			const r = rowsById.get(id);
			if (r && r.reservations.length > 0) return true;
		}
		return false;
	}, [selectedIds, rowsById]);

	const statusCounts = useMemo(() => countByStatus(allRows), [allRows]);
	const reservationCount = useMemo(
		() => allRows.filter((r) => r.reservations.length > 0).length,
		[allRows],
	);

	function handleTabChange(value: string) {
		if (value === optimisticTab) return;
		setSelectedIds(new Set());
		startTabTransition(() => {
			setOptimisticTab(value);
			const params = new URLSearchParams(searchParams.toString());
			if (value === ALL_SECTOR_VALUE) params.delete("sector");
			else params.set("sector", value);
			const query = params.toString();
			router.replace(query ? `?${query}` : "?", { scroll: false });
		});
	}

	const isSelected = useCallback(
		(id: number) => selectedIds.has(id),
		[selectedIds],
	);

	const onToggle = useCallback((id: number) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	const onToggleAll = useCallback((ids: number[], allOn: boolean) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (allOn) ids.forEach((id) => next.delete(id));
			else ids.forEach((id) => next.add(id));
			return next;
		});
	}, []);

	const clearSelection = useCallback(() => {
		setSelectedIds(new Set());
	}, []);

	const onEdit = useCallback((stand: StandWithReservationsWithParticipants) => {
		setEditStand(stand);
		setEditOpen(true);
	}, []);

	const onOptimisticStatus = useCallback(
		(ids: number[], status: StandStatus) => {
			const idSet = new Set(ids);
			setLiveSectors((curr) => patchSectors(curr, idSet, { status }));
		},
		[],
	);

	const onOptimisticCategory = useCallback(
		(ids: number[], standCategory: StandCategory) => {
			const idSet = new Set(ids);
			setLiveSectors((curr) => patchSectors(curr, idSet, { standCategory }));
		},
		[],
	);

	const onQuickStatus = useCallback(
		async (stand: StandRow, status: StandStatus) => {
			if (stand.status === status) return;
			setPendingQuickStatusId(stand.id);
			onOptimisticStatus([stand.id], status);
			try {
				const res = await bulkUpdateStands({
					festivalId,
					standIds: [stand.id],
					patch: { status },
				});
				if (res.success) {
					toast.success("Estado actualizado");
					router.refresh();
				} else {
					toast.error(res.message);
					onOptimisticStatus([stand.id], stand.status as StandStatus);
				}
			} finally {
				setPendingQuickStatusId(null);
			}
		},
		[festivalId, router, onOptimisticStatus],
	);

	const columns = useMemo(
		() =>
			createColumns({
				onEdit,
				onQuickStatus,
				pendingQuickStatusId,
				isSelected,
				onToggle,
				onToggleAll,
			}),
		[
			onEdit,
			onQuickStatus,
			pendingQuickStatusId,
			isSelected,
			onToggle,
			onToggleAll,
		],
	);

	const tableFilters = useMemo(() => {
		const { status, category, reservation } = standFilterOptions();
		const base = [
			{ columnId: "status", label: "Estado", options: status },
			{ columnId: "standCategory", label: "Categoría", options: category },
			{
				columnId: "reservation",
				label: "Reservas",
				options: reservation,
			},
		];
		if (optimisticTab === ALL_SECTOR_VALUE) {
			base.unshift({
				columnId: "sector",
				label: "Sector",
				options: liveSectors.map((s) => ({
					value: String(s.id),
					label: s.name,
				})),
			});
		}
		return base;
	}, [liveSectors, optimisticTab]);

	const bulkMenu = (
		<StandBulkActionsMenu
			festivalId={festivalId}
			selectedIds={selectedIdsArr}
			hasReservation={selectedHaveReservation}
			onCleared={clearSelection}
			onDone={() => {
				clearSelection();
				router.refresh();
			}}
			onOptimisticStatus={onOptimisticStatus}
			onOptimisticCategory={onOptimisticCategory}
			onFailure={() => router.refresh()}
		/>
	);

	return (
		<>
			<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-2xl font-bold md:text-3xl">
						Gestión de espacios — {festivalName}
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Filtra, selecciona y edita espacios en lote. Cambia el estado
						rápidamente tocando su etiqueta.
					</p>
				</div>
				<Button variant="outline" size="sm" asChild>
					<Link href={`/dashboard/festivals/${festivalId}/stands`}>
						<ListTree className="mr-2 h-4 w-4" />
						Ir al editor de mapa
					</Link>
				</Button>
			</div>

			<Card className="mb-4">
				<CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
					<div>
						<span className="text-muted-foreground">Total:</span>{" "}
						<span className="font-semibold">{allRows.length}</span>
					</div>
					{STAND_STATUS_OPTIONS.map((o) => (
						<div key={o.value}>
							<span className="text-muted-foreground">
								{getStatusLabel(o.value)}:
							</span>{" "}
							<span className="font-semibold">
								{statusCounts[o.value] ?? 0}
							</span>
						</div>
					))}
					<div>
						<span className="text-muted-foreground">Con reserva:</span>{" "}
						<span className="font-semibold">{reservationCount}</span>
					</div>
				</CardContent>
			</Card>

			<Tabs
				value={optimisticTab}
				onValueChange={handleTabChange}
				className="mb-4"
			>
				<TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted p-1">
					<TabsTrigger value={ALL_SECTOR_VALUE}>
						Todos
						<span className="ml-2 rounded bg-background/80 px-1.5 py-0.5 text-xs">
							{allRows.length}
						</span>
					</TabsTrigger>
					{liveSectors.map((s) => {
						const sectorReservations = s.stands.filter(
							(st) => st.reservations.length > 0,
						).length;
						return (
							<TabsTrigger key={s.id} value={String(s.id)}>
								{s.name}
								<span className="ml-2 rounded bg-background/80 px-1.5 py-0.5 text-xs">
									{s.stands.length}
								</span>
								{sectorReservations > 0 && (
									<span className="ml-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-700">
										{sectorReservations} res.
									</span>
								)}
							</TabsTrigger>
						);
					})}
				</TabsList>
			</Tabs>

			{selectedIds.size > 0 && (
				<div className="mb-3 hidden rounded-lg border bg-background p-3 md:block">
					{bulkMenu}
				</div>
			)}

			<div
				className={cn(
					"transition-opacity",
					isTabPending && "opacity-60 pointer-events-none",
				)}
			>
				<div className="hidden md:block">
					<DataTable
						key={optimisticTab}
						columns={columns}
						data={rowsForTab}
						columnTitles={columnTitles}
						filters={tableFilters}
					/>
				</div>

				<div className="block pb-32 md:hidden">
					<StandManageCardList
						stands={rowsForTab}
						selectedIds={selectedIds}
						onToggle={onToggle}
						onToggleAll={onToggleAll}
						onEdit={onEdit}
					/>
				</div>
			</div>

			{selectedIds.size > 0 && (
				<div className="fixed bottom-0 left-0 right-0 z-50 block border-t bg-background px-4 py-3 shadow-lg md:hidden">
					<div className="mx-auto max-w-3xl">{bulkMenu}</div>
				</div>
			)}

			<StandEditFormDialog
				stand={editStand}
				open={editOpen}
				onOpenChange={(open) => {
					setEditOpen(open);
					if (!open) setEditStand(null);
				}}
				onSaved={() => {
					router.refresh();
				}}
			/>
		</>
	);
}
