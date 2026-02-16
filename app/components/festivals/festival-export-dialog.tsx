"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Label } from "@/app/components/ui/label";
import { Checkbox } from "@/app/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/app/components/ui/radio-group";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/app/components/ui/dialog";
import { exportFestivalData } from "@/app/lib/festival_exports/actions";
import { fetchFestivalWithDatesAndSectors } from "@/app/lib/festivals/actions";
import { FestivalWithDatesAndSectors } from "@/app/lib/festivals/definitions";

type ExportScope = "all" | "basic_info" | "sectors_only";

type FestivalExportDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	festivalId: number;
};

export default function FestivalExportDialog({
	open,
	onOpenChange,
	festivalId,
}: FestivalExportDialogProps) {
	const [festival, setFestival] = useState<FestivalWithDatesAndSectors | null>(
		null,
	);
	const [isLoading, setIsLoading] = useState(false);
	const [exportScope, setExportScope] = useState<ExportScope>("all");
	const [selectedSectorIds, setSelectedSectorIds] = useState<Set<number>>(
		new Set(),
	);
	const [isExporting, setIsExporting] = useState(false);

	const loadFestivalData = useCallback(async () => {
		setIsLoading(true);
		try {
			const data = await fetchFestivalWithDatesAndSectors(festivalId);
			setFestival(data);
			if (data) {
				setSelectedSectorIds(new Set(data.festivalSectors.map((s) => s.id)));
			}
		} catch (error) {
			console.error("Error loading festival data", error);
			toast.error("Error al cargar los datos del festival");
		} finally {
			setIsLoading(false);
		}
	}, [festivalId]);

	// Lazy-load festival data when dialog opens
	useEffect(() => {
		if (open) {
			loadFestivalData();
		}
	}, [open, festivalId, loadFestivalData]);

	const toggleSector = (sectorId: number) => {
		setSelectedSectorIds((prev) => {
			const next = new Set(prev);
			if (next.has(sectorId)) {
				next.delete(sectorId);
			} else {
				next.add(sectorId);
			}
			return next;
		});
	};

	const selectAll = () => {
		if (festival) {
			setSelectedSectorIds(new Set(festival.festivalSectors.map((s) => s.id)));
		}
	};

	const deselectAll = () => {
		setSelectedSectorIds(new Set());
	};

	const showSectorSelection =
		exportScope === "all" || exportScope === "sectors_only";

	const handleDownload = async () => {
		if (showSectorSelection && selectedSectorIds.size === 0) {
			toast.error("Selecciona al menos un sector");
			return;
		}

		setIsExporting(true);
		try {
			const result = await exportFestivalData(festivalId, {
				includeBasicInfo: exportScope === "all" || exportScope === "basic_info",
				includeSectors: exportScope === "all" || exportScope === "sectors_only",
				sectorIds:
					showSectorSelection &&
					festival &&
					selectedSectorIds.size !== festival.festivalSectors.length
						? Array.from(selectedSectorIds)
						: undefined,
			});

			if (!result.success || !result.data) {
				toast.error(result.message);
				return;
			}

			// Download as JSON file
			const blob = new Blob([JSON.stringify(result.data, null, 2)], {
				type: "application/json",
			});
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			const fileName =
				festival?.name.replace(/[^a-zA-Z0-9-_ ]/g, "") ?? "festival";
			link.download = `${fileName}-export.json`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);

			toast.success("Datos exportados correctamente");
			onOpenChange(false);
		} catch (error) {
			console.error("Error downloading export", error);
			toast.error("Error al exportar los datos");
		} finally {
			setIsExporting(false);
		}
	};

	const getSummary = () => {
		if (!festival) return "";

		const parts: string[] = [];
		if (exportScope === "all" || exportScope === "basic_info") {
			parts.push("informacion basica");
		}
		if (showSectorSelection) {
			const sectorCount = selectedSectorIds.size;
			const standCount = festival.festivalSectors
				.filter((s) => selectedSectorIds.has(s.id))
				.reduce((acc, s) => acc + (s.stands?.length ?? 0), 0);
			parts.push(
				`${sectorCount} sector${sectorCount !== 1 ? "es" : ""}, ${standCount} espacio${standCount !== 1 ? "s" : ""}`,
			);
		}
		return `Se exportaran: ${parts.join(", ")}`;
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Exportar datos del festival</DialogTitle>
					<DialogDescription>
						Descarga los datos del festival como archivo JSON para reutilizarlos
						en otro festival.
					</DialogDescription>
				</DialogHeader>

				{isLoading ? (
					<div className="flex items-center justify-center py-8">
						<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
					</div>
				) : festival ? (
					<div className="grid gap-4 py-2">
						<div className="grid gap-2">
							<Label>Que datos exportar</Label>
							<RadioGroup
								value={exportScope}
								onValueChange={(v) => setExportScope(v as ExportScope)}
							>
								<label className="flex items-center gap-2 cursor-pointer">
									<RadioGroupItem value="all" />
									<span className="text-sm">
										Todo
										<span className="text-muted-foreground ml-1">
											(informacion basica + sectores + espacios)
										</span>
									</span>
								</label>
								<label className="flex items-center gap-2 cursor-pointer">
									<RadioGroupItem value="basic_info" />
									<span className="text-sm">
										Solo informacion basica
										<span className="text-muted-foreground ml-1">
											(nombre, fechas, tipo, etc.)
										</span>
									</span>
								</label>
								<label className="flex items-center gap-2 cursor-pointer">
									<RadioGroupItem value="sectors_only" />
									<span className="text-sm">
										Solo sectores
										<span className="text-muted-foreground ml-1">
											(sectores, espacios y elementos)
										</span>
									</span>
								</label>
							</RadioGroup>
						</div>

						{showSectorSelection && festival.festivalSectors.length > 0 && (
							<div className="grid gap-2">
								<div className="flex items-center justify-between">
									<Label>Sectores a incluir</Label>
									<div className="flex gap-2 text-xs">
										<button
											type="button"
											onClick={selectAll}
											className="text-primary hover:underline"
										>
											Todos
										</button>
										<span className="text-muted-foreground">|</span>
										<button
											type="button"
											onClick={deselectAll}
											className="text-primary hover:underline"
										>
											Ninguno
										</button>
									</div>
								</div>
								<div className="rounded-md border p-3 space-y-2 max-h-40 overflow-y-auto">
									{festival.festivalSectors.map((sector) => (
										<label
											key={sector.id}
											className="flex items-center gap-2 cursor-pointer"
										>
											<Checkbox
												checked={selectedSectorIds.has(sector.id)}
												onCheckedChange={() => toggleSector(sector.id)}
											/>
											<span className="text-sm flex-1">{sector.name}</span>
										</label>
									))}
								</div>
							</div>
						)}

						<p className="text-xs text-muted-foreground">{getSummary()}</p>
					</div>
				) : (
					<div className="text-center py-8 text-muted-foreground">
						No se pudieron cargar los datos del festival.
					</div>
				)}

				<DialogFooter>
					<Button
						onClick={handleDownload}
						disabled={
							isExporting ||
							isLoading ||
							!festival ||
							(showSectorSelection && selectedSectorIds.size === 0)
						}
					>
						<Download className="h-4 w-4 mr-2" />
						{isExporting ? "Exportando..." : "Descargar JSON"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
