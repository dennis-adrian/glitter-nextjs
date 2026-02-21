"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/app/components/ui/dialog";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/app/components/ui/tooltip";
import { Subcategory } from "@/app/lib/subcategories/definitions";
import {
	SectorWithStandsAndSubcategories,
	StandWithSubcategories,
	addStandSubcategory,
	removeStandSubcategory,
	setStandSubcategoriesBulk,
} from "@/app/lib/stands/subcategory-actions";
import { Settings2, X } from "lucide-react";
import { toast } from "sonner";

type Props = {
	festivalId: number;
	sectors: SectorWithStandsAndSubcategories[];
	allSubcategories: Subcategory[];
};

// ─── Per-stand dialog ────────────────────────────────────────────────────────

function StandSubcategoryDialog({
	stand,
	festivalId,
	allSubcategories,
}: {
	stand: StandWithSubcategories;
	festivalId: number;
	allSubcategories: Subcategory[];
}) {
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();

	const assignedIds = new Set(
		stand.standSubcategories.map((sc) => sc.subcategoryId),
	);
	const relevantSubcategories = allSubcategories.filter(
		(sc) => sc.category === stand.standCategory,
	);

	function handleToggle(subcategoryId: number, checked: boolean) {
		startTransition(async () => {
			const res = checked
				? await addStandSubcategory(stand.id, subcategoryId, festivalId)
				: await removeStandSubcategory(stand.id, subcategoryId, festivalId);
			if (!res.success) toast.error(res.message);
		});
	}

	const standLabel = `${stand.label ?? ""}${stand.standNumber}`;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="ghost" size="sm" className="h-7 px-2">
					<Settings2 className="h-3.5 w-3.5" />
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Stand {standLabel} — Subcategorías</DialogTitle>
				</DialogHeader>
				<p className="text-sm text-muted-foreground">
					Restringe este stand a ciertas subcategorías. Sin asignación, todos
					los usuarios de la categoría <strong>{stand.standCategory}</strong>{" "}
					podrán verlo.
				</p>
				{relevantSubcategories.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No hay subcategorías definidas para {stand.standCategory}.
					</p>
				) : (
					<div className="flex flex-col gap-3">
						{relevantSubcategories.map((sc) => (
							<label
								key={sc.id}
								className="flex items-center gap-3 cursor-pointer"
							>
								<Checkbox
									checked={assignedIds.has(sc.id)}
									disabled={isPending}
									onCheckedChange={(checked) =>
										handleToggle(sc.id, checked === true)
									}
								/>
								<span className="text-sm font-medium">{sc.label}</span>
							</label>
						))}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

// ─── Bulk dialog ─────────────────────────────────────────────────────────────

function BulkSubcategoryDialog({
	standIds,
	category,
	festivalId,
	allSubcategories,
	onDone,
}: {
	standIds: number[];
	category: string;
	festivalId: number;
	allSubcategories: Subcategory[];
	onDone: () => void;
}) {
	const [open, setOpen] = useState(false);
	const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
	const [isPending, startTransition] = useTransition();

	const relevantSubcategories = allSubcategories.filter(
		(sc) => sc.category === category,
	);

	function handleToggle(id: number, checked: boolean) {
		setCheckedIds((prev) => {
			const next = new Set(prev);
			checked ? next.add(id) : next.delete(id);
			return next;
		});
	}

	function handleConfirm() {
		startTransition(async () => {
			const res = await setStandSubcategoriesBulk(
				standIds,
				Array.from(checkedIds),
				festivalId,
			);
			if (res.success) {
				toast.success(res.message);
				setOpen(false);
				onDone();
			} else {
				toast.error(res.message);
			}
		});
	}

	function handleOpenChange(next: boolean) {
		if (next) setCheckedIds(new Set()); // reset on open
		setOpen(next);
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogTrigger asChild>
				<Button size="sm">Editar subcategorías</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						Editar subcategorías — {standIds.length} stand
						{standIds.length !== 1 ? "s" : ""}
					</DialogTitle>
				</DialogHeader>
				<p className="text-sm text-muted-foreground">
					Esto <strong>reemplazará</strong> las subcategorías de todos los
					stands seleccionados. Deja todo sin marcar para quitar restricciones.
				</p>
				{relevantSubcategories.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No hay subcategorías definidas para {category}.
					</p>
				) : (
					<div className="flex flex-col gap-3">
						{relevantSubcategories.map((sc) => (
							<label
								key={sc.id}
								className="flex items-center gap-3 cursor-pointer"
							>
								<Checkbox
									checked={checkedIds.has(sc.id)}
									disabled={isPending}
									onCheckedChange={(checked) =>
										handleToggle(sc.id, checked === true)
									}
								/>
								<span className="text-sm font-medium">{sc.label}</span>
							</label>
						))}
					</div>
				)}
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => setOpen(false)}
						disabled={isPending}
					>
						Cancelar
					</Button>
					<Button onClick={handleConfirm} disabled={isPending}>
						{isPending ? "Guardando…" : "Confirmar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Main editor ─────────────────────────────────────────────────────────────

export default function StandSubcategoryEditor({
	festivalId,
	sectors,
	allSubcategories,
}: Props) {
	const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

	const allStands = sectors.flatMap((s) => s.stands);

	function toggleStand(id: number) {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			next.has(id) ? next.delete(id) : next.add(id);
			return next;
		});
	}

	function toggleSector(sectorStands: StandWithSubcategories[]) {
		const ids = sectorStands.map((s) => s.id);
		const allSelected = ids.every((id) => selectedIds.has(id));
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (allSelected) {
				ids.forEach((id) => next.delete(id));
			} else {
				ids.forEach((id) => next.add(id));
			}
			return next;
		});
	}

	function clearSelection() {
		setSelectedIds(new Set());
	}

	// Derive the unique categories of selected stands
	const selectedStands = allStands.filter((s) => selectedIds.has(s.id));
	const selectedCategories = [
		...new Set(selectedStands.map((s) => s.standCategory)),
	];
	const isMixedCategories = selectedCategories.length > 1;
	const bulkCategory = selectedCategories[0] ?? "";

	return (
		<TooltipProvider>
			<div className="flex flex-col gap-8 pb-24">
				{sectors.map((sector) => {
					const sectorIds = sector.stands.map((s) => s.id);
					const allSectorSelected =
						sectorIds.length > 0 &&
						sectorIds.every((id) => selectedIds.has(id));
					const someSectorSelected = sectorIds.some((id) =>
						selectedIds.has(id),
					);

					return (
						<div key={sector.id}>
							{/* Sector header */}
							<div className="flex items-center gap-3 mb-3">
								<Checkbox
									checked={
										allSectorSelected
											? true
											: someSectorSelected
												? "indeterminate"
												: false
									}
									onCheckedChange={() => toggleSector(sector.stands)}
									aria-label={`Seleccionar todos en ${sector.name}`}
								/>
								<h2 className="text-base font-semibold">{sector.name}</h2>
							</div>

							{sector.stands.length === 0 ? (
								<p className="text-sm text-muted-foreground pl-7">Sin stands</p>
							) : (
								<div className="rounded-lg border divide-y">
									{sector.stands.map((stand) => {
										const isSelected = selectedIds.has(stand.id);
										const standLabel = `${stand.label ?? ""}${stand.standNumber}`;

										return (
											<div
												key={stand.id}
												className={`flex items-center gap-3 px-4 py-3 transition-colors ${
													isSelected ? "bg-muted/50" : ""
												}`}
											>
												<Checkbox
													checked={isSelected}
													onCheckedChange={() => toggleStand(stand.id)}
													aria-label={`Seleccionar stand ${standLabel}`}
												/>
												<div className="flex items-center gap-3 min-w-0 flex-1">
													<span className="text-sm font-medium shrink-0">
														Stand {standLabel}
													</span>
													<span className="text-xs text-muted-foreground capitalize shrink-0">
														{stand.standCategory}
													</span>
													<div className="flex flex-wrap gap-1.5">
														{stand.standSubcategories.length === 0 ? (
															<span className="text-xs text-muted-foreground italic">
																Sin restricción
															</span>
														) : (
															stand.standSubcategories.map((sc) => (
																<Badge
																	key={sc.id}
																	variant="secondary"
																	className="text-xs"
																>
																	{sc.subcategory.label}
																</Badge>
															))
														)}
													</div>
												</div>
												<StandSubcategoryDialog
													stand={stand}
													festivalId={festivalId}
													allSubcategories={allSubcategories}
												/>
											</div>
										);
									})}
								</div>
							)}
						</div>
					);
				})}
			</div>

			{/* Sticky bulk action bar */}
			{selectedIds.size > 0 && (
				<div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background shadow-lg px-4 py-3">
					<div className="max-w-3xl mx-auto flex items-center gap-3 flex-wrap">
						<span className="text-sm font-medium">
							{selectedIds.size} stand{selectedIds.size !== 1 ? "s" : ""}{" "}
							seleccionado{selectedIds.size !== 1 ? "s" : ""}
						</span>
						{isMixedCategories ? (
							<Badge variant="destructive" className="text-xs">
								Múltiples categorías
							</Badge>
						) : (
							<Badge variant="secondary" className="text-xs capitalize">
								{bulkCategory}
							</Badge>
						)}

						<div className="ml-auto flex items-center gap-2">
							{isMixedCategories ? (
								<Tooltip>
									<TooltipTrigger asChild>
										<span>
											<Button size="sm" disabled>
												Editar subcategorías
											</Button>
										</span>
									</TooltipTrigger>
									<TooltipContent>
										Selecciona stands de la misma categoría
									</TooltipContent>
								</Tooltip>
							) : (
								<BulkSubcategoryDialog
									standIds={Array.from(selectedIds)}
									category={bulkCategory}
									festivalId={festivalId}
									allSubcategories={allSubcategories}
									onDone={clearSelection}
								/>
							)}
							<Button variant="ghost" size="sm" onClick={clearSelection}>
								<X className="h-4 w-4 mr-1" />
								Limpiar
							</Button>
						</div>
					</div>
				</div>
			)}
		</TooltipProvider>
	);
}
