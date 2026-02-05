"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
	TransformComponent,
	TransformWrapper,
	type ReactZoomPanPinchContentRef,
} from "react-zoom-pan-pinch";
import {
	AlignEndHorizontal,
	AlignEndVertical,
	AlignHorizontalSpaceAround,
	AlignStartHorizontal,
	AlignStartVertical,
	AlignVerticalSpaceAround,
	Grid3x3,
	Magnet,
	Maximize2,
	Pencil,
	Plus,
	Ruler,
	RotateCcw,
	Save,
	Trash2,
	Undo2,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import { toast } from "sonner";

import { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import {
	createStands,
	deleteStands,
	updateStand,
	updateStandPositions,
} from "@/app/api/stands/actions";
import { updateSectorMapBounds } from "@/app/lib/festival_sectors/actions";
import { getStandPosition, STAND_SIZE } from "../map-utils";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Switch } from "@/app/components/ui/switch";
import { Separator } from "@/app/components/ui/separator";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/app/components/ui/dialog";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/app/components/ui/tabs";
import AdminMapCanvas, {
	type AdminMapCanvasHandle,
	type MapBounds,
} from "./admin-map-canvas";

type StandPositionEditorProps = {
	festivalId: number;
	sectors: FestivalSectorWithStandsWithReservationsWithParticipants[];
};

function buildPositionsMap(
	sectors: FestivalSectorWithStandsWithReservationsWithParticipants[],
): Map<number, { left: number; top: number }> {
	const map = new Map<number, { left: number; top: number }>();
	for (const sector of sectors) {
		for (const stand of sector.stands) {
			const pos = getStandPosition(stand);
			map.set(stand.id, { left: pos.left, top: pos.top });
		}
	}
	return map;
}

function getSectorInitialBounds(
	sector: FestivalSectorWithStandsWithReservationsWithParticipants,
): MapBounds | null {
	if (
		sector.mapOriginX != null &&
		sector.mapOriginY != null &&
		sector.mapWidth != null &&
		sector.mapHeight != null
	) {
		return {
			minX: sector.mapOriginX,
			minY: sector.mapOriginY,
			width: sector.mapWidth,
			height: sector.mapHeight,
		};
	}
	return null;
}

function buildOriginalBoundsMap(
	sectors: FestivalSectorWithStandsWithReservationsWithParticipants[],
): Map<number, MapBounds | null> {
	const map = new Map<number, MapBounds | null>();
	for (const sector of sectors) {
		map.set(sector.id, getSectorInitialBounds(sector));
	}
	return map;
}

const MAX_UNDO = 30;

export default function StandPositionEditor({
	festivalId,
	sectors,
}: StandPositionEditorProps) {
	const [positions, setPositions] = useState(() => buildPositionsMap(sectors));
	const [originalPositions, setOriginalPositions] = useState(() =>
		buildPositionsMap(sectors),
	);
	const [history, setHistory] = useState<
		Map<number, { left: number; top: number }>[]
	>([]);
	const [panDisabled, setPanDisabled] = useState(false);
	const [isSaving, setIsSaving] = useState(false);

	// Map bounds per sector
	const [boundsPerSector, setBoundsPerSector] = useState<
		Map<number, MapBounds>
	>(new Map());
	const [originalBounds, setOriginalBounds] = useState(() =>
		buildOriginalBoundsMap(sectors),
	);
	const canvasRefsMap = useRef<Map<number, AdminMapCanvasHandle>>(new Map());

	// Alignment aids state
	const [selectedStands, setSelectedStands] = useState<Set<number>>(new Set());
	const [snapToGrid, setSnapToGrid] = useState(true);
	const [gridSize, setGridSize] = useState(2);
	const [showGrid, setShowGrid] = useState(false);
	const [showGuides, setShowGuides] = useState(true);
	const [focusedStandId, setFocusedStandId] = useState<number | null>(null);
	const arrowUndoPushedRef = useRef(false);
	const transformRefsMap = useRef<Map<number, ReactZoomPanPinchContentRef>>(new Map());

	// Local stands per sector (allows add/delete without full page reload)
	const [standsPerSector, setStandsPerSector] = useState<
		Map<number, StandWithReservationsWithParticipants[]>
	>(() => {
		const map = new Map<number, StandWithReservationsWithParticipants[]>();
		for (const sector of sectors) {
			map.set(sector.id, sector.stands);
		}
		return map;
	});

	// Track active sector tab for add/delete operations
	const defaultSectorId =
		sectors.length > 0 ? String(sectors[0].id) : undefined;
	const [activeSectorId, setActiveSectorId] = useState(defaultSectorId);

	// Add stands dialog state
	const [addDialogOpen, setAddDialogOpen] = useState(false);
	const [addLabel, setAddLabel] = useState("");
	const [addCount, setAddCount] = useState(1);
	const [addStartNumber, setAddStartNumber] = useState(1);
	const [addStatus, setAddStatus] = useState<
		"available" | "reserved" | "confirmed" | "disabled"
	>("disabled");
	const [isAdding, setIsAdding] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	// Edit stand dialog state
	const [editDialogOpen, setEditDialogOpen] = useState(false);
	const [editStandId, setEditStandId] = useState<number | null>(null);
	const [editLabel, setEditLabel] = useState("");
	const [editStandNumber, setEditStandNumber] = useState(1);
	const [editStatus, setEditStatus] = useState<
		"available" | "reserved" | "confirmed" | "disabled"
	>("disabled");
	const [isEditing, setIsEditing] = useState(false);

	// Keyboard handler for arrow key movement
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (!focusedStandId) return;

			const el = document.activeElement;
			if (
				el instanceof HTMLInputElement ||
				el instanceof HTMLTextAreaElement ||
				el instanceof HTMLSelectElement ||
				(el instanceof HTMLElement && el.isContentEditable)
			) {
				return;
			}

			if (e.key === "Escape") {
				setFocusedStandId(null);
				return;
			}

			const arrowKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
			if (!arrowKeys.includes(e.key)) return;

			e.preventDefault();

			// Push undo only on first keypress of a sequence
			if (!arrowUndoPushedRef.current) {
				arrowUndoPushedRef.current = true;
				setHistory((prev) => {
					const snapshot = new Map(positions);
					const next = [...prev, snapshot];
					if (next.length > MAX_UNDO) next.shift();
					return next;
				});
			}

			const step = e.shiftKey ? 0.5 : snapToGrid ? gridSize : 1;
			let dx = 0;
			let dy = 0;

			if (e.key === "ArrowLeft") dx = -step;
			if (e.key === "ArrowRight") dx = step;
			if (e.key === "ArrowUp") dy = -step;
			if (e.key === "ArrowDown") dy = step;

			// Determine which stands to move
			const standsToMove =
				selectedStands.has(focusedStandId) && selectedStands.size >= 2
					? selectedStands
					: new Set([focusedStandId]);

			setPositions((prev) => {
				const next = new Map(prev);
				for (const id of standsToMove) {
					const pos = next.get(id);
					if (pos) {
						next.set(id, { left: pos.left + dx, top: pos.top + dy });
					}
				}
				return next;
			});
		}

		function handleKeyUp(e: KeyboardEvent) {
			const arrowKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
			if (arrowKeys.includes(e.key)) {
				arrowUndoPushedRef.current = false;
			}
		}

		document.addEventListener("keydown", handleKeyDown);
		document.addEventListener("keyup", handleKeyUp);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			document.removeEventListener("keyup", handleKeyUp);
		};
	}, [focusedStandId, selectedStands, positions, snapToGrid, gridSize]);

	const handleFocus = useCallback((standId: number) => {
		setFocusedStandId(standId);
		setSelectedStands(new Set([standId]));
	}, []);

	const handleDeselectAll = useCallback(() => {
		setSelectedStands(new Set());
		setFocusedStandId(null);
	}, []);

	const handleAddStands = async () => {
		if (!activeSectorId || !addLabel.trim()) return;
		const sectorId = Number(activeSectorId);

		setIsAdding(true);

		// Place new stands at center of current sector bounds
		const bounds = boundsPerSector.get(sectorId);
		const centerLeft = bounds
			? bounds.minX + bounds.width / 2 - STAND_SIZE / 2
			: 0;
		const centerTop = bounds
			? bounds.minY + bounds.height / 2 - STAND_SIZE / 2
			: 0;

		const result = await createStands({
			sectorId,
			festivalId,
			label: addLabel.trim(),
			count: addCount,
			startNumber: addStartNumber,
			status: addStatus,
			positionLeft: centerLeft,
			positionTop: centerTop,
		});

		setIsAdding(false);

		if (!result.success) {
			toast.error(result.message);
			return;
		}

		// Add new stands to local state
		const newStands: StandWithReservationsWithParticipants[] =
			result.stands.map((s) => ({ ...s, reservations: [] }));

		setStandsPerSector((prev) => {
			const next = new Map(prev);
			const current = next.get(sectorId) || [];
			next.set(sectorId, [...current, ...newStands]);
			return next;
		});

		setPositions((prev) => {
			const next = new Map(prev);
			for (const stand of result.stands) {
				next.set(stand.id, {
					left: stand.positionLeft ?? centerLeft,
					top: stand.positionTop ?? centerTop,
				});
			}
			return next;
		});

		setOriginalPositions((prev) => {
			const next = new Map(prev);
			for (const stand of result.stands) {
				next.set(stand.id, {
					left: stand.positionLeft ?? centerLeft,
					top: stand.positionTop ?? centerTop,
				});
			}
			return next;
		});

		toast.success(result.message);
		setAddDialogOpen(false);
		setAddLabel("");
		setAddCount(1);
		setAddStartNumber(1);
		setAddStatus("disabled");
	};

	const handleDeleteStands = useCallback(async () => {
		if (selectedStands.size === 0) return;

		const ids = Array.from(selectedStands);

		// Client-side check: block deletion of stands with reservations
		for (const [, sectorStands] of standsPerSector) {
			for (const stand of sectorStands) {
				if (ids.includes(stand.id) && stand.reservations.length > 0) {
					toast.error("No se pueden eliminar espacios con reservaciones");
					return;
				}
			}
		}

		setIsDeleting(true);
		const result = await deleteStands(ids);
		setIsDeleting(false);

		if (!result.success) {
			toast.error(result.message);
			return;
		}

		const deletedSet = new Set(ids);

		setStandsPerSector((prev) => {
			const next = new Map(prev);
			for (const [sectorId, sectorStands] of next) {
				next.set(
					sectorId,
					sectorStands.filter((s) => !deletedSet.has(s.id)),
				);
			}
			return next;
		});

		setPositions((prev) => {
			const next = new Map(prev);
			for (const id of ids) {
				next.delete(id);
			}
			return next;
		});

		setSelectedStands(new Set());
		setFocusedStandId(null);
		toast.success(result.message);
	}, [selectedStands, standsPerSector]);

	const openEditDialog = () => {
		if (selectedStands.size !== 1) return;
		const standId = Array.from(selectedStands)[0];
		for (const [, sectorStands] of standsPerSector) {
			const stand = sectorStands.find((s) => s.id === standId);
			if (stand) {
				setEditStandId(stand.id);
				setEditLabel(stand.label ?? "");
				setEditStandNumber(stand.standNumber);
				setEditStatus(stand.status);
				setEditDialogOpen(true);
				return;
			}
		}
	};

	const handleEditStand = async () => {
		if (editStandId == null || !editLabel.trim()) return;

		setIsEditing(true);
		const result = await updateStand({
			id: editStandId,
			label: editLabel.trim(),
			standNumber: editStandNumber,
			status: editStatus,
		});
		setIsEditing(false);

		if (!result.success || !result.stand) {
			toast.error(result.message);
			return;
		}

		const updated = result.stand;

		setStandsPerSector((prev) => {
			const next = new Map(prev);
			for (const [sectorId, sectorStands] of next) {
				const idx = sectorStands.findIndex((s) => s.id === updated.id);
				if (idx !== -1) {
					const copy = [...sectorStands];
					copy[idx] = { ...copy[idx], ...updated };
					next.set(sectorId, copy);
					break;
				}
			}
			return next;
		});

		toast.success(result.message);
		setEditDialogOpen(false);
	};

	const changedCount = Array.from(positions.entries()).filter(([id, pos]) => {
		const orig = originalPositions.get(id);
		if (!orig) return false;
		return (
			Math.abs(orig.left - pos.left) > 0.01 ||
			Math.abs(orig.top - pos.top) > 0.01
		);
	}).length;

	const boundsChanged = Array.from(boundsPerSector.entries()).some(
		([sectorId, bounds]) => {
			const orig = originalBounds.get(sectorId);
			if (!orig) return true; // Was null (auto), now has explicit bounds
			return (
				Math.abs(orig.minX - bounds.minX) > 0.01 ||
				Math.abs(orig.minY - bounds.minY) > 0.01 ||
				Math.abs(orig.width - bounds.width) > 0.01 ||
				Math.abs(orig.height - bounds.height) > 0.01
			);
		},
	);

	const hasChanges = changedCount > 0 || boundsChanged;

	const pushUndo = useCallback(() => {
		setHistory((prev) => {
			const snapshot = new Map(positions);
			const next = [...prev, snapshot];
			if (next.length > MAX_UNDO) next.shift();
			return next;
		});
	}, [positions]);

	const handleDragStart = useCallback(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		(standId: number) => {
			setPanDisabled(true);
			pushUndo();
		},
		[pushUndo],
	);

	const handleDragEnd = useCallback(() => {
		setPanDisabled(false);
	}, []);

	const handlePositionChange = useCallback(
		(standId: number, left: number, top: number) => {
			setPositions((prev) => {
				const next = new Map(prev);
				next.set(standId, { left, top });
				return next;
			});
		},
		[],
	);

	const handleSelect = useCallback((standId: number) => {
		setSelectedStands((prev) => {
			const next = new Set(prev);
			if (next.has(standId)) {
				next.delete(standId);
			} else {
				next.add(standId);
			}
			return next;
		});
	}, []);

	const handleUndo = useCallback(() => {
		setHistory((prev) => {
			if (prev.length === 0) return prev;
			const next = [...prev];
			const snapshot = next.pop()!;
			setPositions(snapshot);
			return next;
		});
	}, []);

	const handleReset = useCallback(() => {
		setPositions(new Map(originalPositions));
		setHistory([]);
		setSelectedStands(new Set());
		setFocusedStandId(null);
		// Reset bounds for each sector
		for (const [sectorId, handle] of canvasRefsMap.current) {
			const origBounds = originalBounds.get(sectorId) ?? null;
			handle.resetBounds(origBounds);
		}
		setBoundsPerSector(new Map());
	}, [originalPositions, originalBounds]);

	const handleSave = useCallback(async () => {
		const changedPositions = Array.from(positions.entries())
			.filter(([id, pos]) => {
				const orig = originalPositions.get(id);
				if (!orig) return false;
				return (
					Math.abs(orig.left - pos.left) > 0.01 ||
					Math.abs(orig.top - pos.top) > 0.01
				);
			})
			.map(([id, pos]) => ({
				id,
				positionLeft: Math.round(pos.left * 100) / 100,
				positionTop: Math.round(pos.top * 100) / 100,
			}));

		const changedBounds = Array.from(boundsPerSector.entries()).filter(
			([sectorId, bounds]) => {
				const orig = originalBounds.get(sectorId);
				if (!orig) return true;
				return (
					Math.abs(orig.minX - bounds.minX) > 0.01 ||
					Math.abs(orig.minY - bounds.minY) > 0.01 ||
					Math.abs(orig.width - bounds.width) > 0.01 ||
					Math.abs(orig.height - bounds.height) > 0.01
				);
			},
		);

		if (changedPositions.length === 0 && changedBounds.length === 0) {
			toast.info("No hay cambios para guardar");
			return;
		}

		setIsSaving(true);

		const results: { success: boolean; message: string }[] = [];

		if (changedPositions.length > 0) {
			results.push(await updateStandPositions(changedPositions));
		}

		for (const [sectorId, bounds] of changedBounds) {
			results.push(await updateSectorMapBounds(sectorId, bounds));
		}

		setIsSaving(false);

		const failed = results.find((r) => !r.success);
		if (failed) {
			toast.error(failed.message);
		} else {
			toast.success("Cambios guardados con éxito");
			setOriginalPositions(new Map(positions));
			// Update original bounds to match saved values
			setOriginalBounds((prev) => {
				const next = new Map(prev);
				for (const [sectorId, bounds] of changedBounds) {
					next.set(sectorId, bounds);
				}
				return next;
			});
			setHistory([]);
		}
	}, [positions, boundsPerSector, originalPositions, originalBounds]);

	// Alignment actions
	const applyAlignment = useCallback(
		(
			action: (
				selected: Map<number, { left: number; top: number }>,
			) => Map<number, { left: number; top: number }>,
		) => {
			if (selectedStands.size < 2) return;
			pushUndo();

			const selectedPositions = new Map<
				number,
				{ left: number; top: number }
			>();
			for (const id of selectedStands) {
				const pos = positions.get(id);
				if (pos) selectedPositions.set(id, { ...pos });
			}

			const updated = action(selectedPositions);

			setPositions((prev) => {
				const next = new Map(prev);
				for (const [id, pos] of updated) {
					next.set(id, pos);
				}
				return next;
			});
		},
		[selectedStands, positions, pushUndo],
	);

	const alignLeft = () =>
		applyAlignment((selected) => {
			const minLeft = Math.min(
				...Array.from(selected.values()).map((p) => p.left),
			);
			const result = new Map(selected);
			for (const [id, pos] of result) {
				result.set(id, { ...pos, left: minLeft });
			}
			return result;
		});

	const alignRight = () =>
		applyAlignment((selected) => {
			const maxLeft = Math.max(
				...Array.from(selected.values()).map((p) => p.left),
			);
			const result = new Map(selected);
			for (const [id, pos] of result) {
				result.set(id, { ...pos, left: maxLeft });
			}
			return result;
		});

	const alignTop = () =>
		applyAlignment((selected) => {
			const minTop = Math.min(
				...Array.from(selected.values()).map((p) => p.top),
			);
			const result = new Map(selected);
			for (const [id, pos] of result) {
				result.set(id, { ...pos, top: minTop });
			}
			return result;
		});

	const alignBottom = () =>
		applyAlignment((selected) => {
			const maxTop = Math.max(
				...Array.from(selected.values()).map((p) => p.top),
			);
			const result = new Map(selected);
			for (const [id, pos] of result) {
				result.set(id, { ...pos, top: maxTop });
			}
			return result;
		});

	const distributeHorizontally = () =>
		applyAlignment((selected) => {
			const entries = Array.from(selected.entries()).sort(
				([, a], [, b]) => a.left - b.left,
			);
			if (entries.length < 3) {
				// With 2 items, just align them to the same left
				return selected;
			}
			const first = entries[0][1].left;
			const last = entries[entries.length - 1][1].left;
			const step = (last - first) / (entries.length - 1);
			const result = new Map(selected);
			for (let i = 0; i < entries.length; i++) {
				const [id, pos] = entries[i];
				result.set(id, { ...pos, left: first + step * i });
			}
			return result;
		});

	const distributeVertically = () =>
		applyAlignment((selected) => {
			const entries = Array.from(selected.entries()).sort(
				([, a], [, b]) => a.top - b.top,
			);
			if (entries.length < 3) {
				return selected;
			}
			const first = entries[0][1].top;
			const last = entries[entries.length - 1][1].top;
			const step = (last - first) / (entries.length - 1);
			const result = new Map(selected);
			for (let i = 0; i < entries.length; i++) {
				const [id, pos] = entries[i];
				result.set(id, { ...pos, top: first + step * i });
			}
			return result;
		});

	const hasSelection = selectedStands.size >= 2;

	return (
		<div className="space-y-4">
			{/* Main toolbar: Save / Undo / Reset */}
			<div className="flex items-center gap-2 flex-wrap">
				<Button
					variant="default"
					size="sm"
					onClick={handleSave}
					disabled={isSaving || !hasChanges}
				>
					<Save className="h-4 w-4 mr-1" />
					{isSaving ? "Guardando..." : "Guardar"}
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={handleUndo}
					disabled={history.length === 0}
				>
					<Undo2 className="h-4 w-4 mr-1" />
					Deshacer
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={handleReset}
					disabled={!hasChanges}
				>
					<RotateCcw className="h-4 w-4 mr-1" />
					Restablecer
				</Button>
				{changedCount > 0 && (
					<span className="text-sm text-muted-foreground">
						{changedCount} espacio{changedCount !== 1 ? "s" : ""} movido
						{changedCount !== 1 ? "s" : ""}
					</span>
				)}
			</div>

			{/* Toggles toolbar */}
			<div className="flex items-center gap-4 flex-wrap text-sm">
				<label className="flex items-center gap-2 cursor-pointer">
					<Ruler className="h-4 w-4 text-muted-foreground" />
					<span>Guias</span>
					<Switch checked={showGuides} onCheckedChange={setShowGuides} />
				</label>
				<label className="flex items-center gap-2 cursor-pointer">
					<Magnet className="h-4 w-4 text-muted-foreground" />
					<span>Ajustar a grilla</span>
					<Switch checked={snapToGrid} onCheckedChange={setSnapToGrid} />
				</label>
				<label className="flex items-center gap-2 cursor-pointer">
					<Grid3x3 className="h-4 w-4 text-muted-foreground" />
					<span>Mostrar grilla</span>
					<Switch checked={showGrid} onCheckedChange={setShowGrid} />
				</label>
				{(snapToGrid || showGrid) && (
					<label className="flex items-center gap-2">
						<span className="text-muted-foreground">Tamaño:</span>
						<select
							value={gridSize}
							onChange={(e) => setGridSize(Number(e.target.value))}
							className="h-8 rounded-md border bg-background px-2 text-sm"
						>
							<option value={1}>1</option>
							<option value={2}>2</option>
							<option value={4}>4</option>
							<option value={5}>5</option>
							<option value={8}>8</option>
						</select>
					</label>
				)}
			</div>

			{/* Alignment toolbar */}
			<div className="flex items-center gap-1 flex-wrap">
				<span className="text-sm text-muted-foreground mr-1">
					Alinear ({selectedStands.size} seleccionados):
				</span>
				<Button
					variant="outline"
					size="icon"
					className="h-8 w-8"
					onClick={alignLeft}
					disabled={!hasSelection}
					title="Alinear a la izquierda"
				>
					<AlignStartVertical className="h-4 w-4" />
				</Button>
				<Button
					variant="outline"
					size="icon"
					className="h-8 w-8"
					onClick={alignRight}
					disabled={!hasSelection}
					title="Alinear a la derecha"
				>
					<AlignEndVertical className="h-4 w-4" />
				</Button>
				<Button
					variant="outline"
					size="icon"
					className="h-8 w-8"
					onClick={alignTop}
					disabled={!hasSelection}
					title="Alinear arriba"
				>
					<AlignStartHorizontal className="h-4 w-4" />
				</Button>
				<Button
					variant="outline"
					size="icon"
					className="h-8 w-8"
					onClick={alignBottom}
					disabled={!hasSelection}
					title="Alinear abajo"
				>
					<AlignEndHorizontal className="h-4 w-4" />
				</Button>
				<Separator orientation="vertical" className="h-6 mx-1" />
				<Button
					variant="outline"
					size="icon"
					className="h-8 w-8"
					onClick={distributeHorizontally}
					disabled={selectedStands.size < 3}
					title="Distribuir horizontalmente"
				>
					<AlignHorizontalSpaceAround className="h-4 w-4" />
				</Button>
				<Button
					variant="outline"
					size="icon"
					className="h-8 w-8"
					onClick={distributeVertically}
					disabled={selectedStands.size < 3}
					title="Distribuir verticalmente"
				>
					<AlignVerticalSpaceAround className="h-4 w-4" />
				</Button>
				<Separator orientation="vertical" className="h-6 mx-1" />
				<Button
					variant="outline"
					size="sm"
					onClick={() => setAddDialogOpen(true)}
				>
					<Plus className="h-4 w-4 mr-1" />
					Agregar stands
				</Button>
				{selectedStands.size === 1 && (
					<Button variant="outline" size="sm" onClick={openEditDialog}>
						<Pencil className="h-4 w-4 mr-1" />
						Editar
					</Button>
				)}
				{selectedStands.size > 0 && (
					<Button
						variant="destructive"
						size="sm"
						onClick={handleDeleteStands}
						disabled={isDeleting}
					>
						<Trash2 className="h-4 w-4 mr-1" />
						{isDeleting ? "Eliminando..." : `Eliminar (${selectedStands.size})`}
					</Button>
				)}
			</div>

			<Tabs value={activeSectorId} onValueChange={setActiveSectorId}>
				<TabsList>
					{sectors.map((sector) => (
						<TabsTrigger key={sector.id} value={String(sector.id)}>
							{sector.name}
						</TabsTrigger>
					))}
				</TabsList>

				{sectors.map((sector) => (
					<TabsContent key={sector.id} value={String(sector.id)}>
						<TransformWrapper
							ref={(handle) => {
								if (handle) {
									transformRefsMap.current.set(sector.id, handle);
								} else {
									transformRefsMap.current.delete(sector.id);
								}
							}}
							initialScale={1}
							minScale={0.1}
							maxScale={6}
							wheel={{ step: 0.1 }}
							panning={{ disabled: panDisabled }}
						>
							<div
								className="relative w-full rounded-lg border bg-background shadow-sm overflow-hidden resize-y"
								style={{ height: "calc(100vh - 320px)", minHeight: 300 }}
							>
								<TransformComponent
									wrapperStyle={{ width: "100%", height: "100%" }}
									contentStyle={{ width: "100%", height: "100%" }}
								>
									<AdminMapCanvas
										ref={(handle) => {
											if (handle) {
												canvasRefsMap.current.set(sector.id, handle);
											} else {
												canvasRefsMap.current.delete(sector.id);
											}
										}}
										stands={standsPerSector.get(sector.id) ?? sector.stands}
										positions={positions}
										selectedStands={selectedStands}
										focusedStandId={focusedStandId}
										snapToGrid={snapToGrid}
										gridSize={gridSize}
										showGrid={showGrid}
										showGuides={showGuides}
										initialBounds={getSectorInitialBounds(sector)}
										onPositionChange={handlePositionChange}
										onDragStart={handleDragStart}
										onDragEnd={handleDragEnd}
										onSelect={handleSelect}
										onFocus={handleFocus}
										onDeselectAll={handleDeselectAll}
										onBoundsChange={(bounds) => {
											setBoundsPerSector((prev) => {
												const next = new Map(prev);
												next.set(sector.id, bounds);
												return next;
											});
										}}
										onResizeStart={() => setPanDisabled(true)}
										onResizeEnd={() => setPanDisabled(false)}
									/>
								</TransformComponent>
								<div className="absolute bottom-2 right-2 z-10 flex gap-1">
									<Button
										variant="outline"
										size="icon"
										className="h-8 w-8"
										onClick={() => transformRefsMap.current.get(sector.id)?.zoomIn()}
										title="Acercar"
									>
										<ZoomIn className="h-4 w-4" />
									</Button>
									<Button
										variant="outline"
										size="icon"
										className="h-8 w-8"
										onClick={() => transformRefsMap.current.get(sector.id)?.zoomOut()}
										title="Alejar"
									>
										<ZoomOut className="h-4 w-4" />
									</Button>
									<Button
										variant="outline"
										size="sm"
										onClick={() => transformRefsMap.current.get(sector.id)?.resetTransform()}
										title="Ajustar mapa al contenedor"
									>
										<Maximize2 className="h-4 w-4 mr-1" />
										Ajustar
									</Button>
								</div>
							</div>
						</TransformWrapper>
					</TabsContent>
				))}
			</Tabs>

			<Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Agregar stands</DialogTitle>
					</DialogHeader>
					<div className="grid gap-4 py-2">
						<div className="grid gap-2">
							<Label htmlFor="add-label">Etiqueta</Label>
							<Input
								id="add-label"
								placeholder='Ej: "A", "B", "Espacio"'
								value={addLabel}
								onChange={(e) => setAddLabel(e.target.value)}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="add-status">Estado</Label>
							<select
								id="add-status"
								value={addStatus}
								onChange={(e) =>
									setAddStatus(e.target.value as typeof addStatus)
								}
								className="h-9 rounded-md border bg-background px-3 text-sm"
							>
								<option value="disabled">Deshabilitado</option>
								<option value="available">Disponible</option>
								<option value="reserved">Reservado</option>
								<option value="confirmed">Confirmado</option>
							</select>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="add-count">Cantidad</Label>
							<Input
								id="add-count"
								type="number"
								min={1}
								max={100}
								value={addCount}
								onChange={(e) =>
									setAddCount(Math.max(1, Number(e.target.value)))
								}
							/>
						</div>
						{addCount > 1 && (
							<div className="grid gap-2">
								<Label htmlFor="add-start">Número inicial</Label>
								<Input
									id="add-start"
									type="number"
									min={1}
									value={addStartNumber}
									onChange={(e) =>
										setAddStartNumber(Math.max(1, Number(e.target.value)))
									}
								/>
								<p className="text-xs text-muted-foreground">
									Se crearán: {addLabel || "?"}
									{addStartNumber}
									{addCount > 1 &&
										` – ${addLabel || "?"}${addStartNumber + addCount - 1}`}
								</p>
							</div>
						)}
					</div>
					<DialogFooter>
						<Button
							onClick={handleAddStands}
							disabled={isAdding || !addLabel.trim()}
						>
							{isAdding ? "Creando..." : "Agregar"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Editar espacio</DialogTitle>
					</DialogHeader>
					<div className="grid gap-4 py-2">
						<div className="grid gap-2">
							<Label htmlFor="edit-label">Etiqueta</Label>
							<Input
								id="edit-label"
								value={editLabel}
								onChange={(e) => setEditLabel(e.target.value)}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="edit-number">Número</Label>
							<Input
								id="edit-number"
								type="number"
								min={1}
								value={editStandNumber}
								onChange={(e) =>
									setEditStandNumber(Math.max(1, Number(e.target.value)))
								}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="edit-status">Estado</Label>
							<select
								id="edit-status"
								value={editStatus}
								onChange={(e) =>
									setEditStatus(e.target.value as typeof editStatus)
								}
								className="h-9 rounded-md border bg-background px-3 text-sm"
							>
								<option value="disabled">Deshabilitado</option>
								<option value="available">Disponible</option>
								<option value="reserved">Reservado</option>
								<option value="confirmed">Confirmado</option>
							</select>
						</div>
					</div>
					<DialogFooter>
						<Button
							onClick={handleEditStand}
							disabled={isEditing || !editLabel.trim()}
						>
							{isEditing ? "Guardando..." : "Guardar"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
