"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { ListTree, X } from "lucide-react";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import {
	bulkUpdateStands,
	deleteStands,
	renumberStandsSequentially,
	updateStand,
} from "@/app/api/stands/actions";
import { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/components/ui/select";
import { StandStatusBadge } from "@/app/components/stands/status-badge";

const STAND_STATUS_OPTIONS = [
	{ value: "available", label: "Disponible" },
	{ value: "held", label: "En espera" },
	{ value: "reserved", label: "Reservado" },
	{ value: "confirmed", label: "Confirmado" },
	{ value: "disabled", label: "Deshabilitado" },
] as const;

type StandStatus = (typeof STAND_STATUS_OPTIONS)[number]["value"];

const CATEGORY_OPTIONS = [
	{ value: "none", label: "Ninguna" },
	{ value: "illustration", label: "Ilustración" },
	{ value: "gastronomy", label: "Gastronomía" },
	{ value: "entrepreneurship", label: "Emprendimiento" },
	{ value: "new_artist", label: "Artista nuevo" },
] as const;

type StandCategory = (typeof CATEGORY_OPTIONS)[number]["value"];

function formatPrice(amount: number) {
	return new Intl.NumberFormat("es-BO", {
		style: "currency",
		currency: "BOB",
		minimumFractionDigits: 2,
	}).format(amount);
}

function sortStands(
	list: StandWithReservationsWithParticipants[],
): StandWithReservationsWithParticipants[] {
	return [...list].sort(
		(a, b) =>
			(a.standCategory ?? "").localeCompare(b.standCategory ?? "") ||
			a.standNumber - b.standNumber ||
			a.id - b.id,
	);
}

type Props = {
	festivalId: number;
	festivalName: string;
	sectors: FestivalSectorWithStandsWithReservationsWithParticipants[];
};

export default function StandManageTable({
	festivalId,
	festivalName,
	sectors,
}: Props) {
	const router = useRouter();
	const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

	const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
	const [bulkStatus, setBulkStatus] = useState<StandStatus>("available");

	const [bulkPriceOpen, setBulkPriceOpen] = useState(false);
	const [bulkPrice, setBulkPrice] = useState(0);

	const [bulkLabelOpen, setBulkLabelOpen] = useState(false);
	const [bulkLabel, setBulkLabel] = useState("");

	const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);
	const [bulkCategory, setBulkCategory] =
		useState<StandCategory>("illustration");

	const [renumberOpen, setRenumberOpen] = useState(false);
	const [renumberStart, setRenumberStart] = useState(1);

	const [deleteOpen, setDeleteOpen] = useState(false);

	const [singleOpen, setSingleOpen] = useState(false);
	const [editStand, setEditStand] =
		useState<StandWithReservationsWithParticipants | null>(null);
	const [editLabel, setEditLabel] = useState("");
	const [editStandNumber, setEditStandNumber] = useState(1);
	const [editStatus, setEditStatus] = useState<StandStatus>("available");
	const [editPrice, setEditPrice] = useState(0);
	const [editCategory, setEditCategory] =
		useState<StandCategory>("illustration");
	const [isSaving, setIsSaving] = useState(false);
	const [pendingBulk, setPendingBulk] = useState(false);

	const allStands = useMemo(() => {
		const out: StandWithReservationsWithParticipants[] = [];
		for (const s of sectors) {
			for (const st of s.stands) out.push(st);
		}
		return out;
	}, [sectors]);

	const standById = useMemo(() => {
		const m = new Map<number, StandWithReservationsWithParticipants>();
		for (const s of allStands) m.set(s.id, s);
		return m;
	}, [allStands]);

	const selectedCount = selectedIds.size;
	const selectedIdsArr = useMemo(() => Array.from(selectedIds), [selectedIds]);

	const selectedHaveReservation = useMemo(() => {
		for (const id of selectedIds) {
			const st = standById.get(id);
			if (st && st.reservations.length > 0) return true;
		}
		return false;
	}, [selectedIds, standById]);

	const toggleStand = (id: number) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const toggleSector = (
		sectorStands: StandWithReservationsWithParticipants[],
	) => {
		const ids = sectorStands.map((s) => s.id);
		setSelectedIds((prev) => {
			const next = new Set(prev);
			const allOn = ids.length > 0 && ids.every((id) => next.has(id));
			if (allOn) ids.forEach((id) => next.delete(id));
			else ids.forEach((id) => next.add(id));
			return next;
		});
	};

	const clearSelection = useCallback(() => {
		setSelectedIds(new Set());
	}, []);

	const runBulk = async (
		fn: () => Promise<{ success: boolean; message: string }>,
		onSuccess?: () => void,
	) => {
		if (selectedIds.size === 0) return;
		setPendingBulk(true);
		try {
			const res = await fn();
			if (res.success) {
				toast.success(res.message);
				onSuccess?.();
				clearSelection();
				router.refresh();
			} else {
				toast.error(res.message);
			}
		} finally {
			setPendingBulk(false);
		}
	};

	const openSingleEdit = (stand: StandWithReservationsWithParticipants) => {
		setEditStand(stand);
		setEditLabel(stand.label ?? "");
		setEditStandNumber(stand.standNumber);
		setEditStatus(stand.status as StandStatus);
		setEditPrice(stand.price ?? 0);
		setEditCategory(stand.standCategory as StandCategory);
		setSingleOpen(true);
	};

	const handleSingleSave = async () => {
		if (!editStand || !editLabel.trim()) return;
		setIsSaving(true);
		try {
			const res = await updateStand({
				id: editStand.id,
				label: editLabel.trim(),
				standNumber: editStandNumber,
				status: editStatus,
				price: editPrice,
				standCategory: editCategory,
			});
			if (res.success) {
				toast.success(res.message);
				setSingleOpen(false);
				setEditStand(null);
				router.refresh();
			} else {
				toast.error(res.message);
			}
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<>
			<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-2xl font-bold md:text-3xl">
						Gestión de espacios — {festivalName}
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Edita metadatos de uno o varios stands. Selecciona filas y usa las
						acciones inferiores. El orden al renumerar es: número de stand
						ascendente y luego ID.
					</p>
				</div>
				<Button variant="outline" size="sm" asChild>
					<Link href={`/dashboard/festivals/${festivalId}/stands`}>
						<ListTree className="mr-2 h-4 w-4" />
						Ir al editor de mapa
					</Link>
				</Button>
			</div>

			<div className="flex flex-col gap-8 pb-32">
				{sectors.map((sector) => {
					const sectorStands = sortStands(sector.stands);
					const sectorIds = sectorStands.map((s) => s.id);
					const allSectorSelected =
						sectorIds.length > 0 &&
						sectorIds.every((id) => selectedIds.has(id));
					const someSectorSelected = sectorIds.some((id) =>
						selectedIds.has(id),
					);

					return (
						<div key={sector.id}>
							<div className="mb-3 flex items-center gap-3">
								<Checkbox
									checked={
										allSectorSelected
											? true
											: someSectorSelected
												? "indeterminate"
												: false
									}
									onCheckedChange={() => toggleSector(sectorStands)}
									aria-label={`Seleccionar todos en ${sector.name}`}
								/>
								<h2 className="text-base font-semibold">{sector.name}</h2>
							</div>

							{sectorStands.length === 0 ? (
								<p className="pl-7 text-sm text-muted-foreground">
									Sin stands en este sector
								</p>
							) : (
								<div className="divide-y rounded-lg border">
									{sectorStands.map((stand) => {
										const isSelected = selectedIds.has(stand.id);
										const hasRes = stand.reservations.length > 0;
										const standLabel = `${stand.label ?? ""}${stand.standNumber}`;

										return (
											<div
												key={stand.id}
												className={`flex flex-wrap items-center gap-3 px-4 py-3 transition-colors ${
													isSelected ? "bg-muted/50" : ""
												}`}
											>
												<Checkbox
													checked={isSelected}
													onCheckedChange={() => toggleStand(stand.id)}
													aria-label={`Seleccionar stand ${standLabel}`}
												/>
												<div className="min-w-0 flex-1">
													<div className="flex flex-wrap items-center gap-2">
														<span className="shrink-0 text-sm font-medium">
															Stand {standLabel}
														</span>
														<StandStatusBadge status={stand.status} />
														<span className="text-xs capitalize text-muted-foreground">
															{stand.standCategory}
														</span>
														{hasRes && (
															<Badge variant="secondary" className="text-xs">
																Con reserva
															</Badge>
														)}
													</div>
													<p className="text-xs text-muted-foreground">
														{formatPrice(stand.price ?? 0)}
													</p>
												</div>
												<Button
													variant="outline"
													size="sm"
													onClick={() => openSingleEdit(stand)}
												>
													Editar
												</Button>
											</div>
										);
									})}
								</div>
							)}
						</div>
					);
				})}
			</div>

			{selectedCount > 0 && (
				<div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background px-4 py-3 shadow-lg">
					<div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
						<span className="text-sm font-medium">
							{selectedCount} espacio{selectedCount !== 1 ? "s" : ""}{" "}
							seleccionado
							{selectedCount !== 1 ? "s" : ""}
						</span>
						<div className="ml-auto flex flex-wrap items-center gap-2">
							<Button
								variant="secondary"
								size="sm"
								disabled={pendingBulk}
								onClick={() => setBulkStatusOpen(true)}
							>
								Estado
							</Button>
							<Button
								variant="secondary"
								size="sm"
								disabled={pendingBulk}
								onClick={() => setBulkPriceOpen(true)}
							>
								Precio
							</Button>
							<Button
								variant="secondary"
								size="sm"
								disabled={pendingBulk}
								onClick={() => setBulkLabelOpen(true)}
							>
								Etiqueta
							</Button>
							<Button
								variant="secondary"
								size="sm"
								disabled={pendingBulk}
								onClick={() => setBulkCategoryOpen(true)}
							>
								Categoría
							</Button>
							<Button
								variant="secondary"
								size="sm"
								disabled={pendingBulk}
								onClick={() => setRenumberOpen(true)}
							>
								Renumerar
							</Button>
							<Button
								variant="destructive"
								size="sm"
								disabled={pendingBulk || selectedHaveReservation}
								title={
									selectedHaveReservation
										? "No se pueden eliminar stands con reservas"
										: undefined
								}
								onClick={() => setDeleteOpen(true)}
							>
								Eliminar
							</Button>
							<Button variant="ghost" size="sm" onClick={clearSelection}>
								<X className="mr-1 h-4 w-4" />
								Limpiar
							</Button>
						</div>
					</div>
				</div>
			)}

			<Dialog open={bulkStatusOpen} onOpenChange={setBulkStatusOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Cambiar estado ({selectedCount})</DialogTitle>
					</DialogHeader>
					<div className="grid gap-2">
						<Label>Estado</Label>
						<Select
							value={bulkStatus}
							onValueChange={(v) => setBulkStatus(v as StandStatus)}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{STAND_STATUS_OPTIONS.map((o) => (
									<SelectItem key={o.value} value={o.value}>
										{o.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setBulkStatusOpen(false)}>
							Cancelar
						</Button>
						<Button
							disabled={pendingBulk}
							onClick={() => {
								void runBulk(
									() =>
										bulkUpdateStands({
											festivalId,
											standIds: selectedIdsArr,
											patch: { status: bulkStatus },
										}),
									() => setBulkStatusOpen(false),
								);
							}}
						>
							Guardar
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={bulkPriceOpen} onOpenChange={setBulkPriceOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Establecer precio ({selectedCount})</DialogTitle>
					</DialogHeader>
					<div className="grid gap-2">
						<Label htmlFor="bulk-price">Precio (BOB)</Label>
						<Input
							id="bulk-price"
							type="number"
							min={0}
							step={1}
							value={bulkPrice}
							onChange={(e) =>
								setBulkPrice(Math.max(0, Number(e.target.value) || 0))
							}
						/>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setBulkPriceOpen(false)}>
							Cancelar
						</Button>
						<Button
							disabled={pendingBulk}
							onClick={() => {
								void runBulk(
									() =>
										bulkUpdateStands({
											festivalId,
											standIds: selectedIdsArr,
											patch: { price: bulkPrice },
										}),
									() => setBulkPriceOpen(false),
								);
							}}
						>
							Guardar
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={bulkLabelOpen} onOpenChange={setBulkLabelOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Establecer etiqueta ({selectedCount})</DialogTitle>
					</DialogHeader>
					<p className="text-sm text-muted-foreground">
						Se aplicará el mismo prefijo de etiqueta a todos los stands
						seleccionados (p. ej. &quot;S&quot;).
					</p>
					<div className="grid gap-2">
						<Label htmlFor="bulk-label">Etiqueta</Label>
						<Input
							id="bulk-label"
							value={bulkLabel}
							onChange={(e) => setBulkLabel(e.target.value)}
						/>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setBulkLabelOpen(false)}>
							Cancelar
						</Button>
						<Button
							disabled={pendingBulk || !bulkLabel.trim()}
							onClick={() => {
								const label = bulkLabel.trim();
								void runBulk(
									() =>
										bulkUpdateStands({
											festivalId,
											standIds: selectedIdsArr,
											patch: { label },
										}),
									() => {
										setBulkLabelOpen(false);
										setBulkLabel("");
									},
								);
							}}
						>
							Guardar
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={bulkCategoryOpen} onOpenChange={setBulkCategoryOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Cambiar categoría ({selectedCount})</DialogTitle>
					</DialogHeader>
					<div className="grid gap-2">
						<Label>Categoría</Label>
						<Select
							value={bulkCategory}
							onValueChange={(v) => setBulkCategory(v as StandCategory)}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{CATEGORY_OPTIONS.map((o) => (
									<SelectItem key={o.value} value={o.value}>
										{o.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setBulkCategoryOpen(false)}
						>
							Cancelar
						</Button>
						<Button
							disabled={pendingBulk}
							onClick={() => {
								void runBulk(
									() =>
										bulkUpdateStands({
											festivalId,
											standIds: selectedIdsArr,
											patch: { standCategory: bulkCategory },
										}),
									() => setBulkCategoryOpen(false),
								);
							}}
						>
							Guardar
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={renumberOpen} onOpenChange={setRenumberOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Renumerar en secuencia ({selectedCount})</DialogTitle>
					</DialogHeader>
					<p className="text-sm text-muted-foreground">
						El primer stand seleccionado (según el orden: número de stand, luego
						ID) recibirá el número indicado; los siguientes serán consecutivos.
					</p>
					<div className="grid gap-2">
						<Label htmlFor="renumber-start">Número inicial</Label>
						<Input
							id="renumber-start"
							type="number"
							min={1}
							value={renumberStart}
							onChange={(e) =>
								setRenumberStart(Math.max(1, Number(e.target.value) || 1))
							}
						/>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setRenumberOpen(false)}>
							Cancelar
						</Button>
						<Button
							disabled={pendingBulk}
							onClick={() => {
								void runBulk(
									() =>
										renumberStandsSequentially({
											festivalId,
											standIds: selectedIdsArr,
											startNumber: renumberStart,
										}),
									() => setRenumberOpen(false),
								);
							}}
						>
							Aplicar
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Eliminar {selectedCount} espacio(s)</DialogTitle>
					</DialogHeader>
					<p className="text-sm text-muted-foreground">
						Esta acción no se puede deshacer. No puedes eliminar stands con
						reservas.
					</p>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDeleteOpen(false)}>
							Cancelar
						</Button>
						<Button
							variant="destructive"
							disabled={pendingBulk || selectedHaveReservation}
							onClick={() => {
								void runBulk(
									() => deleteStands(selectedIdsArr),
									() => setDeleteOpen(false),
								);
							}}
						>
							Eliminar
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={singleOpen} onOpenChange={setSingleOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Editar espacio</DialogTitle>
					</DialogHeader>
					<div className="grid gap-4 py-2">
						<div className="grid gap-2">
							<Label htmlFor="single-label">Etiqueta</Label>
							<Input
								id="single-label"
								value={editLabel}
								onChange={(e) => setEditLabel(e.target.value)}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="single-number">Número</Label>
							<Input
								id="single-number"
								type="number"
								min={1}
								value={editStandNumber}
								onChange={(e) =>
									setEditStandNumber(Math.max(1, Number(e.target.value) || 1))
								}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="single-status">Estado</Label>
							<Select
								value={editStatus}
								onValueChange={(v) => setEditStatus(v as StandStatus)}
							>
								<SelectTrigger id="single-status">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{STAND_STATUS_OPTIONS.map((o) => (
										<SelectItem key={o.value} value={o.value}>
											{o.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div className="grid gap-2">
								<Label htmlFor="single-price">Precio</Label>
								<Input
									id="single-price"
									type="number"
									min={0}
									step={1}
									value={editPrice}
									onChange={(e) =>
										setEditPrice(Math.max(0, Number(e.target.value) || 0))
									}
								/>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="single-cat">Categoría</Label>
								<Select
									value={editCategory}
									onValueChange={(v) => setEditCategory(v as StandCategory)}
								>
									<SelectTrigger id="single-cat">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{CATEGORY_OPTIONS.map((o) => (
											<SelectItem key={o.value} value={o.value}>
												{o.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>
					</div>
					<DialogFooter>
						<Button
							onClick={handleSingleSave}
							disabled={isSaving || !editLabel.trim()}
						>
							{isSaving ? "Guardando…" : "Guardar"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
