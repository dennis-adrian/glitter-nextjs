"use client";

import {
	ChevronDownIcon,
	HashIcon,
	LayersIcon,
	SignpostIcon,
	TagIcon,
	Trash2Icon,
	WalletIcon,
	XIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
	bulkUpdateStands,
	deleteStands,
	renumberStandsSequentially,
} from "@/app/api/stands/actions";
import { Button } from "@/app/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/app/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/components/ui/select";

import {
	CATEGORY_OPTIONS,
	CONFIRMATION_THRESHOLD,
	STAND_STATUS_OPTIONS,
	StandCategory,
	StandStatus,
} from "@/app/components/maps/admin/stand-manage/shared";

type Props = {
	festivalId: number;
	selectedIds: number[];
	hasReservation: boolean;
	onCleared?: () => void;
	onDone?: () => void;
	onOptimisticStatus?: (ids: number[], status: StandStatus) => void;
	onOptimisticCategory?: (ids: number[], category: StandCategory) => void;
	onFailure?: () => void;
};

type DialogKey =
	| null
	| "status"
	| "price"
	| "label"
	| "category"
	| "renumber"
	| "delete";

function confirmationNote(count: number) {
	if (count <= CONFIRMATION_THRESHOLD) return null;
	return (
		<p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
			Vas a aplicar este cambio a <strong>{count}</strong> espacios. Verifica
			antes de guardar.
		</p>
	);
}

export default function StandBulkActionsMenu({
	festivalId,
	selectedIds,
	hasReservation,
	onCleared,
	onDone,
	onOptimisticStatus,
	onOptimisticCategory,
	onFailure,
}: Props) {
	const [dialog, setDialog] = useState<DialogKey>(null);
	const [pending, setPending] = useState(false);

	const [status, setStatus] = useState<StandStatus>("available");
	const [price, setPrice] = useState(0);
	const [label, setLabel] = useState("");
	const [category, setCategory] = useState<StandCategory>("illustration");
	const [renumberStart, setRenumberStart] = useState(1);

	const count = selectedIds.length;

	async function runBulk(
		fn: () => Promise<{ success: boolean; message: string }>,
		onSuccess?: () => void,
	) {
		if (count === 0) return;
		setPending(true);
		try {
			const res = await fn();
			if (res.success) {
				toast.success(res.message);
				onSuccess?.();
				setDialog(null);
				onDone?.();
			} else {
				toast.error(res.message);
				onFailure?.();
			}
		} catch {
			toast.error("Error al aplicar el cambio. Intenta de nuevo.");
			onFailure?.();
		} finally {
			setPending(false);
		}
	}

	if (count === 0) return null;

	return (
		<>
			<div className="flex flex-wrap items-center gap-2">
				<span className="text-sm font-medium">
					{count} espacio{count !== 1 ? "s" : ""} seleccionado
					{count !== 1 ? "s" : ""}
				</span>
				<div className="ml-auto flex items-center gap-2">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="secondary" size="sm" disabled={pending}>
								Editar selección
								<ChevronDownIcon className="ml-1 h-4 w-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onSelect={() => setDialog("status")}>
								<SignpostIcon className="mr-2 h-4 w-4" />
								Cambiar estado
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={() => setDialog("category")}>
								<LayersIcon className="mr-2 h-4 w-4" />
								Cambiar categoría
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={() => setDialog("price")}>
								<WalletIcon className="mr-2 h-4 w-4" />
								Establecer precio
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={() => setDialog("label")}>
								<TagIcon className="mr-2 h-4 w-4" />
								Establecer etiqueta
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem onSelect={() => setDialog("renumber")}>
								<HashIcon className="mr-2 h-4 w-4" />
								Renumerar en secuencia
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>

					<Button
						variant="destructive"
						size="sm"
						disabled={pending || hasReservation}
						title={
							hasReservation
								? "No se pueden eliminar espacios con reservas"
								: undefined
						}
						onClick={() => setDialog("delete")}
					>
						<Trash2Icon className="mr-1 h-4 w-4" />
						Eliminar
					</Button>

					{onCleared && (
						<Button variant="ghost" size="sm" onClick={onCleared}>
							<XIcon className="mr-1 h-4 w-4" />
							Limpiar
						</Button>
					)}
				</div>
			</div>

			<Dialog
				open={dialog === "status"}
				onOpenChange={(o) => !o && setDialog(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Cambiar estado ({count})</DialogTitle>
					</DialogHeader>
					{confirmationNote(count)}
					<div className="grid gap-2">
						<Label>Estado</Label>
						<Select
							value={status}
							onValueChange={(v) => setStatus(v as StandStatus)}
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
						<Button variant="outline" onClick={() => setDialog(null)}>
							Cancelar
						</Button>
						<Button
							disabled={pending}
							onClick={() => {
								onOptimisticStatus?.(selectedIds, status);
								void runBulk(() =>
									bulkUpdateStands({
										festivalId,
										standIds: selectedIds,
										patch: { status },
									}),
								);
							}}
						>
							{pending ? "Guardando…" : "Guardar"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={dialog === "category"}
				onOpenChange={(o) => !o && setDialog(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Cambiar categoría ({count})</DialogTitle>
					</DialogHeader>
					{confirmationNote(count)}
					<div className="grid gap-2">
						<Label>Categoría</Label>
						<Select
							value={category}
							onValueChange={(v) => setCategory(v as StandCategory)}
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
						<Button variant="outline" onClick={() => setDialog(null)}>
							Cancelar
						</Button>
						<Button
							disabled={pending}
							onClick={() => {
								onOptimisticCategory?.(selectedIds, category);
								void runBulk(() =>
									bulkUpdateStands({
										festivalId,
										standIds: selectedIds,
										patch: { standCategory: category },
									}),
								);
							}}
						>
							{pending ? "Guardando…" : "Guardar"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={dialog === "price"}
				onOpenChange={(o) => !o && setDialog(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Establecer precio ({count})</DialogTitle>
					</DialogHeader>
					{confirmationNote(count)}
					<div className="grid gap-2">
						<Label htmlFor="bulk-price">Precio (BOB)</Label>
						<Input
							id="bulk-price"
							type="number"
							min={0}
							step={1}
							value={price}
							onChange={(e) =>
								setPrice(Math.max(0, Number(e.target.value) || 0))
							}
						/>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDialog(null)}>
							Cancelar
						</Button>
						<Button
							disabled={pending}
							onClick={() =>
								void runBulk(() =>
									bulkUpdateStands({
										festivalId,
										standIds: selectedIds,
										patch: { price },
									}),
								)
							}
						>
							{pending ? "Guardando…" : "Guardar"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={dialog === "label"}
				onOpenChange={(o) => !o && setDialog(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Establecer etiqueta ({count})</DialogTitle>
						<DialogDescription>
							Reemplaza la etiqueta completa de todos los espacios
							seleccionados.
						</DialogDescription>
					</DialogHeader>
					{confirmationNote(count)}
					<div className="grid gap-2">
						<Label htmlFor="bulk-label">Etiqueta</Label>
						<Input
							id="bulk-label"
							value={label}
							onChange={(e) => setLabel(e.target.value)}
							placeholder="p. ej. S"
						/>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDialog(null)}>
							Cancelar
						</Button>
						<Button
							disabled={pending || !label.trim()}
							onClick={() => {
								const trimmed = label.trim();
								void runBulk(
									() =>
										bulkUpdateStands({
											festivalId,
											standIds: selectedIds,
											patch: { label: trimmed },
										}),
									() => setLabel(""),
								);
							}}
						>
							{pending ? "Guardando…" : "Guardar"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={dialog === "renumber"}
				onOpenChange={(o) => !o && setDialog(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Renumerar en secuencia ({count})</DialogTitle>
						<DialogDescription>
							El primer espacio seleccionado (por número de stand, luego ID)
							recibirá el número inicial; los siguientes serán consecutivos.
						</DialogDescription>
					</DialogHeader>
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
						<Button variant="outline" onClick={() => setDialog(null)}>
							Cancelar
						</Button>
						<Button
							disabled={pending}
							onClick={() =>
								void runBulk(() =>
									renumberStandsSequentially({
										festivalId,
										standIds: selectedIds,
										startNumber: renumberStart,
									}),
								)
							}
						>
							{pending ? "Aplicando…" : "Aplicar"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={dialog === "delete"}
				onOpenChange={(o) => !o && setDialog(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Eliminar {count} espacio(s)</DialogTitle>
						<DialogDescription>
							Esta acción no se puede deshacer. No puedes eliminar espacios con
							reservas.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDialog(null)}>
							Cancelar
						</Button>
						<Button
							variant="destructive"
							disabled={pending || hasReservation}
							onClick={() => void runBulk(() => deleteStands(selectedIds))}
						>
							{pending ? "Eliminando…" : "Eliminar"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
