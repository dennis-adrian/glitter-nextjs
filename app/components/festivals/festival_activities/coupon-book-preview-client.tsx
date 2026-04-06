"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	ChevronLeft,
	ChevronRight,
	Download,
	Eye,
	RotateCcw,
	Settings,
} from "lucide-react";

import CouponBookPrintPage from "@/app/components/festivals/festival_activities/coupon-book-print-page";
import {
	COUPON_BOOK_DYNAMIC_SLOTS_PER_PAGE,
	COUPON_BOOK_PAGE_HEIGHT_CM,
	COUPON_BOOK_PAGE_WIDTH_CM,
	CouponTextBoxConfig,
	CouponBookVariant,
	CouponTextLayoutConfig,
	DEFAULT_COUPON_TEXT_LAYOUT_CONFIG,
	paginateCouponBookEntries,
} from "@/app/lib/festival_activites/coupon-book-builder";
import { fitCouponText } from "@/app/lib/festival_activites/fit-coupon-text";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/components/ui/select";
import { Sheet, SheetContent, SheetTitle } from "@/app/components/ui/sheet";

type CouponBookPreviewClientProps = {
	festivalId: number;
	activityId: number;
	activityName: string;
	variants: CouponBookVariant[];
	backUrl: string;
};

type BoxKey = "nameBox" | "highlightBox" | "descriptionBox" | "validityBox";
type BoxNumericField = "xPct" | "yPct" | "widthPct" | "heightPct";

type StoredCouponLayout = {
	textLayoutConfig: CouponTextLayoutConfig;
	pdfCanvasConfig: PdfCanvasConfig;
};

type PdfCanvasConfig = {
	widthCm: number;
	heightCm: number;
	orientation: "portrait" | "landscape";
};

const DEFAULT_PDF_CANVAS_CONFIG: PdfCanvasConfig = {
	widthCm: COUPON_BOOK_PAGE_WIDTH_CM,
	heightCm: COUPON_BOOK_PAGE_HEIGHT_CM,
	orientation: "landscape",
};

const BOX_KEYS: { key: BoxKey; label: string }[] = [
	{ key: "nameBox", label: "Nombre" },
	{ key: "highlightBox", label: "Highlight" },
	{ key: "descriptionBox", label: "Descripción" },
	{ key: "validityBox", label: "Validez" },
];

export default function CouponBookPreviewClient({
	festivalId,
	activityId,
	activityName,
	variants,
	backUrl,
}: CouponBookPreviewClientProps) {
	const storageKey = `couponbook-layout:v1:festival:${festivalId}:activity:${activityId}`;

	const clamp = (value: number, min: number, max: number) =>
		Math.min(max, Math.max(min, value));

	const setBoxValue = (
		boxKey: BoxKey,
		field: BoxNumericField,
		value: string,
		min: number,
		max: number,
	) => {
		const parsed = Number(value);
		if (!Number.isFinite(parsed)) return;
		const clampField = (
			nextValue: number,
			fieldMin: number,
			fieldMax: number,
		) => clamp(nextValue, fieldMin, Math.max(fieldMin, fieldMax));
		setTextLayoutConfig((prev) => {
			const current = prev[boxKey];
			const next: CouponTextBoxConfig = { ...current };

			if (field === "xPct") {
				const maxX = Math.min(max, 100 - current.widthPct);
				next.xPct = clampField(parsed, min, maxX);
				next.widthPct = clampField(current.widthPct, 10, 100 - next.xPct);
			} else if (field === "widthPct") {
				const maxWidth = Math.min(max, 100 - current.xPct);
				next.widthPct = clampField(parsed, min, maxWidth);
				next.xPct = clampField(current.xPct, 0, 100 - next.widthPct);
			} else if (field === "yPct") {
				const maxY = Math.min(max, 100 - current.heightPct);
				next.yPct = clampField(parsed, min, maxY);
				next.heightPct = clampField(current.heightPct, 5, 100 - next.yPct);
			} else if (field === "heightPct") {
				const maxHeight = Math.min(max, 100 - current.yPct);
				next.heightPct = clampField(parsed, min, maxHeight);
				next.yPct = clampField(current.yPct, 0, 100 - next.heightPct);
			}

			return {
				...prev,
				[boxKey]: next,
			};
		});
	};

	const setRootValue = (
		key:
			| "leftColumnWidthPct"
			| "standFontSizeMm"
			| "sectorFontSizeMm"
			| "headerImageScalePct",
		value: string,
		min: number,
		max: number,
	) => {
		const parsed = Number(value);
		if (!Number.isFinite(parsed)) return;
		const clamped = clamp(parsed, min, max);
		setTextLayoutConfig((prev) => ({ ...prev, [key]: clamped }));
	};

	const [editorOpen, setEditorOpen] = useState(false);
	const [isMobile, setIsMobile] = useState(false);
	const [selectedDetailId, setSelectedDetailId] = useState<number>(
		variants[0]?.detailId ?? 0,
	);
	const [selectedPageIndex, setSelectedPageIndex] = useState(0);
	const [previewScale, setPreviewScale] = useState(1);
	const [textLayoutConfig, setTextLayoutConfig] =
		useState<CouponTextLayoutConfig>(DEFAULT_COUPON_TEXT_LAYOUT_CONFIG);
	const [pdfCanvasConfig, setPdfCanvasConfig] = useState<PdfCanvasConfig>(
		DEFAULT_PDF_CANVAS_CONFIG,
	);
	const [storageHydrated, setStorageHydrated] = useState(false);
	const viewportRef = useRef<HTMLDivElement | null>(null);
	const pageFrameRef = useRef<HTMLDivElement | null>(null);

	// Track breakpoint and open panel by default on desktop after hydration
	useEffect(() => {
		const check = () => setIsMobile(window.innerWidth < 1024);
		check();
		window.addEventListener("resize", check);
		return () => window.removeEventListener("resize", check);
	}, []);

	useEffect(() => {
		setEditorOpen(window.innerWidth >= 1024);
	}, []);

	// Restore layout from localStorage
	useEffect(() => {
		try {
			const raw = window.localStorage.getItem(storageKey);
			if (raw) {
				const parsed = JSON.parse(raw) as Partial<StoredCouponLayout>;
				if (parsed.textLayoutConfig) {
					setTextLayoutConfig((prev) => ({
						...prev,
						...parsed.textLayoutConfig,
						nameBox: { ...prev.nameBox, ...parsed.textLayoutConfig?.nameBox },
						highlightBox: {
							...prev.highlightBox,
							...parsed.textLayoutConfig?.highlightBox,
						},
						descriptionBox: {
							...prev.descriptionBox,
							...parsed.textLayoutConfig?.descriptionBox,
						},
						validityBox: {
							...prev.validityBox,
							...parsed.textLayoutConfig?.validityBox,
						},
					}));
				}
				if (parsed.pdfCanvasConfig) {
					const pdfCanvas = parsed.pdfCanvasConfig;
					setPdfCanvasConfig((prev) => ({
						...prev,
						...pdfCanvas,
						widthCm: clamp(pdfCanvas.widthCm ?? prev.widthCm, 10, 200),
						heightCm: clamp(pdfCanvas.heightCm ?? prev.heightCm, 10, 200),
						orientation:
							pdfCanvas.orientation === "portrait" ? "portrait" : "landscape",
					}));
				}
			}
		} catch {
			// Ignore malformed stored layouts and keep defaults.
		} finally {
			setStorageHydrated(true);
		}
	}, [storageKey]);

	// Persist layout to localStorage
	useEffect(() => {
		if (!storageHydrated) return;
		try {
			const payload: StoredCouponLayout = { textLayoutConfig, pdfCanvasConfig };
			window.localStorage.setItem(storageKey, JSON.stringify(payload));
		} catch {
			// Ignore storage errors (private mode/quota) and continue.
		}
	}, [storageHydrated, storageKey, textLayoutConfig, pdfCanvasConfig]);

	const handleResetLayout = () => {
		setTextLayoutConfig(DEFAULT_COUPON_TEXT_LAYOUT_CONFIG);
		setPdfCanvasConfig(DEFAULT_PDF_CANVAS_CONFIG);
	};

	const selectedVariant = useMemo(
		() => variants.find((v) => v.detailId === selectedDetailId),
		[variants, selectedDetailId],
	);

	const pages = useMemo(
		() => paginateCouponBookEntries(selectedVariant?.entries ?? []),
		[selectedVariant],
	);

	const selectedPage = pages[selectedPageIndex] ?? pages[0] ?? null;

	const effectivePdfCanvas = useMemo(() => {
		const longSide = Math.max(
			pdfCanvasConfig.widthCm,
			pdfCanvasConfig.heightCm,
		);
		const shortSide = Math.min(
			pdfCanvasConfig.widthCm,
			pdfCanvasConfig.heightCm,
		);
		return {
			widthCm:
				pdfCanvasConfig.orientation === "landscape" ? longSide : shortSide,
			heightCm:
				pdfCanvasConfig.orientation === "landscape" ? shortSide : longSide,
		};
	}, [pdfCanvasConfig]);

	const estimatedPerSheet = useMemo(() => {
		const cols = Math.max(
			1,
			Math.floor(effectivePdfCanvas.widthCm / COUPON_BOOK_PAGE_WIDTH_CM),
		);
		const rows = Math.max(
			1,
			Math.floor(effectivePdfCanvas.heightCm / COUPON_BOOK_PAGE_HEIGHT_CM),
		);
		return { cols, rows, total: cols * rows };
	}, [effectivePdfCanvas]);

	// Scale preview to fit viewport
	useEffect(() => {
		const updateScale = () => {
			const viewportEl = viewportRef.current;
			const pageEl = pageFrameRef.current;
			if (!viewportEl || !pageEl) return;
			const viewportWidth = viewportEl.clientWidth;
			if (viewportWidth <= 0) return;
			const naturalWidth = pageEl.offsetWidth;
			if (naturalWidth <= 0) return;
			const horizontalPadding = 12;
			const nextScale = Math.min(
				1,
				(viewportWidth - horizontalPadding * 2) / naturalWidth,
			);
			setPreviewScale(
				Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1,
			);
		};

		updateScale();
		const observer = new ResizeObserver(updateScale);
		if (viewportRef.current) observer.observe(viewportRef.current);
		window.addEventListener("resize", updateScale);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", updateScale);
		};
	}, [selectedPageIndex, selectedDetailId, editorOpen]);

	// Fit coupon text after paint
	useEffect(() => {
		const frame = pageFrameRef.current;
		if (!frame) return;
		let rafB = 0;
		const rafA = requestAnimationFrame(() => {
			rafB = requestAnimationFrame(() => {
				fitCouponText(frame);
			});
		});
		return () => {
			cancelAnimationFrame(rafA);
			if (rafB) cancelAnimationFrame(rafB);
		};
	}, [
		selectedPageIndex,
		selectedDetailId,
		previewScale,
		pages.length,
		textLayoutConfig,
	]);

	const layoutQuery = new URLSearchParams({
		pdfWcm: String(pdfCanvasConfig.widthCm),
		pdfHcm: String(pdfCanvasConfig.heightCm),
		pdfOrientation: pdfCanvasConfig.orientation,
		leftColW: String(textLayoutConfig.leftColumnWidthPct),
		standFsMm: String(textLayoutConfig.standFontSizeMm),
		sectorFsMm: String(textLayoutConfig.sectorFontSizeMm),
		headerScalePct: String(textLayoutConfig.headerImageScalePct),
		nameX: String(textLayoutConfig.nameBox.xPct),
		nameY: String(textLayoutConfig.nameBox.yPct),
		nameW: String(textLayoutConfig.nameBox.widthPct),
		nameH: String(textLayoutConfig.nameBox.heightPct),
		nameM: textLayoutConfig.nameBox.multiline ? "1" : "0",
		highlightX: String(textLayoutConfig.highlightBox.xPct),
		highlightY: String(textLayoutConfig.highlightBox.yPct),
		highlightW: String(textLayoutConfig.highlightBox.widthPct),
		highlightH: String(textLayoutConfig.highlightBox.heightPct),
		highlightM: textLayoutConfig.highlightBox.multiline ? "1" : "0",
		descriptionX: String(textLayoutConfig.descriptionBox.xPct),
		descriptionY: String(textLayoutConfig.descriptionBox.yPct),
		descriptionW: String(textLayoutConfig.descriptionBox.widthPct),
		descriptionH: String(textLayoutConfig.descriptionBox.heightPct),
		descriptionM: textLayoutConfig.descriptionBox.multiline ? "1" : "0",
		validityX: String(textLayoutConfig.validityBox.xPct),
		validityY: String(textLayoutConfig.validityBox.yPct),
		validityW: String(textLayoutConfig.validityBox.widthPct),
		validityH: String(textLayoutConfig.validityBox.heightPct),
		validityM: textLayoutConfig.validityBox.multiline ? "1" : "0",
	});

	const exportUrl = `/api/festival_activities/${activityId}/couponbook/export?detailId=${selectedDetailId}&${layoutQuery.toString()}`;
	const exportAllUrl = `/api/festival_activities/${activityId}/couponbook/export?${layoutQuery.toString()}`;

	const totalCoupons = selectedVariant?.entries.length ?? 0;

	// Config panel content — shared between desktop aside and mobile Sheet
	const configPanel = (
		<div className="flex flex-col h-full">
			{/* Panel header */}
			<div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
				<p className="font-semibold text-sm">Configuración</p>
				<Button variant="outline" size="sm" onClick={handleResetLayout}>
					<RotateCcw className="h-3.5 w-3.5 mr-1.5" />
					Reset
				</Button>
			</div>

			{/* Scrollable content */}
			<div className="flex-1 overflow-y-auto px-4 py-4 pb-8 space-y-6">
				{/* PDF Config */}
				<div className="space-y-3">
					<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Configuración de PDF
					</p>
					<div className="grid grid-cols-2 gap-2">
						<div className="space-y-1">
							<Label htmlFor="pdf-width-cm" className="text-xs">
								Ancho (cm)
							</Label>
							<Input
								id="pdf-width-cm"
								type="number"
								step="0.01"
								min="10"
								max="200"
								value={pdfCanvasConfig.widthCm}
								onChange={(e) =>
									setPdfCanvasConfig((prev) => ({
										...prev,
										widthCm: clamp(
											Number(e.target.value) || prev.widthCm,
											10,
											200,
										),
									}))
								}
							/>
						</div>
						<div className="space-y-1">
							<Label htmlFor="pdf-height-cm" className="text-xs">
								Alto (cm)
							</Label>
							<Input
								id="pdf-height-cm"
								type="number"
								step="0.01"
								min="10"
								max="200"
								value={pdfCanvasConfig.heightCm}
								onChange={(e) =>
									setPdfCanvasConfig((prev) => ({
										...prev,
										heightCm: clamp(
											Number(e.target.value) || prev.heightCm,
											10,
											200,
										),
									}))
								}
							/>
						</div>
					</div>
					<div className="space-y-1">
						<Label
							id="orientation-select-label"
							htmlFor="orientation-select"
							className="text-xs"
						>
							Orientación
						</Label>
						<Select
							value={pdfCanvasConfig.orientation}
							onValueChange={(value) =>
								setPdfCanvasConfig((prev) => ({
									...prev,
									orientation: value === "portrait" ? "portrait" : "landscape",
								}))
							}
						>
							<SelectTrigger
								id="orientation-select"
								aria-labelledby="orientation-select-label"
								className="w-full"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="landscape">Horizontal</SelectItem>
								<SelectItem value="portrait">Vertical</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<p className="text-xs text-muted-foreground">
						{estimatedPerSheet.total} cuponera(s) por hoja (
						{estimatedPerSheet.cols} × {estimatedPerSheet.rows})
					</p>
				</div>

				{/* Layout */}
				<div className="space-y-3">
					<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Layout
					</p>
					<div className="space-y-1">
						<Label htmlFor="left-column-width-pct" className="text-xs">
							Columna Izquierda (%)
						</Label>
						<Input
							id="left-column-width-pct"
							type="number"
							step="1"
							min="20"
							max="60"
							value={textLayoutConfig.leftColumnWidthPct}
							onChange={(e) =>
								setRootValue("leftColumnWidthPct", e.target.value, 20, 60)
							}
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="header-scale-pct" className="text-xs">
							Escala Header (%)
						</Label>
						<Input
							id="header-scale-pct"
							type="number"
							step="1"
							min="10"
							max="100"
							value={textLayoutConfig.headerImageScalePct}
							onChange={(e) =>
								setRootValue("headerImageScalePct", e.target.value, 10, 100)
							}
						/>
					</div>
					<div className="space-y-1.5">
						<p className="text-xs text-muted-foreground">Tamaños de Fuente</p>
						<div className="grid grid-cols-2 gap-2">
							<div className="space-y-1">
								<Label htmlFor="stand-font-size-mm" className="text-xs">
									Stand (mm)
								</Label>
								<Input
									id="stand-font-size-mm"
									type="number"
									step="0.1"
									min="1.5"
									max="5"
									value={textLayoutConfig.standFontSizeMm}
									onChange={(e) =>
										setRootValue("standFontSizeMm", e.target.value, 1.5, 5)
									}
								/>
							</div>
							<div className="space-y-1">
								<Label htmlFor="sector-font-size-mm" className="text-xs">
									Sector (mm)
								</Label>
								<Input
									id="sector-font-size-mm"
									type="number"
									step="0.1"
									min="1.5"
									max="5"
									value={textLayoutConfig.sectorFontSizeMm}
									onChange={(e) =>
										setRootValue("sectorFontSizeMm", e.target.value, 1.5, 5)
									}
								/>
							</div>
						</div>
					</div>
				</div>

				{/* Text boxes */}
				<div className="space-y-3">
					<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Cajas de Texto
					</p>
					<p className="text-xs text-muted-foreground">
						Ajusta posición y tamaño de cada caja (en % del cupón)
					</p>
					{BOX_KEYS.map(({ key, label }) => {
						const box = textLayoutConfig[key];
						return (
							<div key={key} className="space-y-1.5">
								<p className="text-xs font-medium">{label}</p>
								<div className="grid grid-cols-2 gap-2">
									<div className="space-y-1">
										<Label
											htmlFor={`${key}-xPct`}
											className="text-xs text-muted-foreground"
										>
											X (%)
										</Label>
										<Input
											id={`${key}-xPct`}
											type="number"
											step="1"
											min="0"
											max="100"
											value={box.xPct}
											onChange={(e) =>
												setBoxValue(key, "xPct", e.target.value, 0, 100)
											}
										/>
									</div>
									<div className="space-y-1">
										<Label
											htmlFor={`${key}-yPct`}
											className="text-xs text-muted-foreground"
										>
											Y (%)
										</Label>
										<Input
											id={`${key}-yPct`}
											type="number"
											step="1"
											min="0"
											max="100"
											value={box.yPct}
											onChange={(e) =>
												setBoxValue(key, "yPct", e.target.value, 0, 100)
											}
										/>
									</div>
									<div className="space-y-1">
										<Label
											htmlFor={`${key}-widthPct`}
											className="text-xs text-muted-foreground"
										>
											W (%)
										</Label>
										<Input
											id={`${key}-widthPct`}
											type="number"
											step="1"
											min="10"
											max="100"
											value={box.widthPct}
											onChange={(e) =>
												setBoxValue(key, "widthPct", e.target.value, 10, 100)
											}
										/>
									</div>
									<div className="space-y-1">
										<Label
											htmlFor={`${key}-heightPct`}
											className="text-xs text-muted-foreground"
										>
											H (%)
										</Label>
										<Input
											id={`${key}-heightPct`}
											type="number"
											step="1"
											min="5"
											max="100"
											value={box.heightPct}
											onChange={(e) =>
												setBoxValue(key, "heightPct", e.target.value, 5, 100)
											}
										/>
									</div>
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);

	if (variants.length === 0) {
		return (
			<div className="container p-6">
				<div className="rounded-md border p-4 text-sm text-muted-foreground">
					No hay variantes disponibles para generar cuponera.
				</div>
			</div>
		);
	}

	return (
		<div className="container flex flex-col">
			{/* Page header */}
			<header className="flex items-center gap-3 px-4 py-3 border-b flex-wrap">
				<div className="flex items-center gap-3 min-w-0 flex-1">
					<Link
						href={backUrl}
						className="shrink-0 rounded-sm p-1 hover:bg-muted transition-colors"
					>
						<ChevronLeft className="h-5 w-5" />
						<span className="sr-only">Volver</span>
					</Link>
					<div className="min-w-0">
						<h1 className="font-bold text-base md:text-lg leading-tight truncate">
							Preview Couponbook
						</h1>
						<p className="text-xs text-muted-foreground truncate">
							{activityName}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2 shrink-0">
					<Button asChild variant="outline" size="sm">
						<a href={exportUrl}>
							<Download className="h-4 w-4 mr-1.5" />
							<span className="hidden sm:inline">Descargar variante</span>
							<span className="sm:hidden">Variante</span>
						</a>
					</Button>
					<Button asChild size="sm">
						<a href={exportAllUrl}>
							<Download className="h-4 w-4 mr-1.5" />
							<span className="hidden sm:inline">Descargar todas</span>
							<span className="sm:hidden">Todas</span>
						</a>
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setEditorOpen((v) => !v)}
					>
						<Settings className="h-4 w-4 mr-1.5" />
						Editor
					</Button>
				</div>
			</header>

			{/* Body */}
			<div className="flex items-start min-h-0">
				{/* Main preview area */}
				<div className="flex-1 min-w-0 p-4 space-y-4">
					{/* Variant selector + stats */}
					<div className="space-y-2">
						<Label id="variant-select-label" htmlFor="variant-select">
							Variante
						</Label>
						<Select
							value={String(selectedDetailId)}
							onValueChange={(value) => {
								setSelectedDetailId(Number(value));
								setSelectedPageIndex(0);
							}}
						>
							<SelectTrigger
								id="variant-select"
								aria-labelledby="variant-select-label"
								className="w-full"
							>
								<SelectValue placeholder="Selecciona una variante" />
							</SelectTrigger>
							<SelectContent>
								{variants.map((variant) => (
									<SelectItem
										key={variant.detailId}
										value={String(variant.detailId)}
									>
										{variant.detailLabel} ({variant.entries.length} cupones)
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<div className="text-xs text-muted-foreground space-y-0.5 pt-0.5">
							<div className="flex justify-between">
								<span>Total de cupones:</span>
								<span className="font-medium text-foreground">
									{totalCoupons}
								</span>
							</div>
							<div className="flex justify-between">
								<span>Páginas necesarias:</span>
								<span className="font-medium text-foreground">
									{pages.length}
								</span>
							</div>
							<div className="flex justify-between">
								<span>Cupones por página:</span>
								<span className="font-medium text-foreground">
									{COUPON_BOOK_DYNAMIC_SLOTS_PER_PAGE} (+ 1 cortesía)
								</span>
							</div>
						</div>
					</div>

					{/* Page indicator + navigation */}
					<div className="flex items-center gap-1 text-sm text-muted-foreground">
						<Eye className="h-4 w-4 shrink-0" />
						<span className="ml-1">
							Página {selectedPageIndex + 1} de {pages.length}
						</span>
						{pages.length > 1 && (
							<>
								<Button
									variant="ghost"
									size="icon"
									className="h-7 w-7 ml-1"
									aria-label="Página anterior"
									disabled={selectedPageIndex === 0}
									onClick={() => setSelectedPageIndex((i) => i - 1)}
								>
									<ChevronLeft className="h-4 w-4" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									className="h-7 w-7"
									aria-label="Página siguiente"
									disabled={selectedPageIndex === pages.length - 1}
									onClick={() => setSelectedPageIndex((i) => i + 1)}
								>
									<ChevronRight className="h-4 w-4" />
								</Button>
							</>
						)}
					</div>

					{/* Scaled preview */}
					<div className="rounded-md border bg-muted/20 p-3">
						<div ref={viewportRef} className="w-full overflow-auto">
							<div className="flex justify-center min-w-max">
								<div
									style={{
										width: `calc(${COUPON_BOOK_PAGE_WIDTH_CM}cm * ${previewScale})`,
										height: `calc(${COUPON_BOOK_PAGE_HEIGHT_CM}cm * ${previewScale})`,
									}}
								>
									<div
										ref={pageFrameRef}
										style={{
											width: `${COUPON_BOOK_PAGE_WIDTH_CM}cm`,
											height: `${COUPON_BOOK_PAGE_HEIGHT_CM}cm`,
											transform: `scale(${previewScale})`,
											transformOrigin: "top left",
										}}
									>
										{selectedPage ? (
											<CouponBookPrintPage
												page={selectedPage}
												textLayoutConfig={textLayoutConfig}
												headerImageUrl={selectedVariant?.headerImageUrl ?? null}
												headerImageScalePct={
													textLayoutConfig.headerImageScalePct
												}
											/>
										) : null}
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>

				{/* Desktop config panel — inline, toggled by editorOpen */}
				{editorOpen && (
					<aside className="hidden lg:flex flex-col w-[300px] shrink-0 border-l sticky top-4 h-[calc(100vh-6rem)] overflow-hidden">
						{configPanel}
					</aside>
				)}
			</div>

			{/* Mobile config panel — Sheet (only active on mobile to avoid overlay on desktop) */}
			<Sheet open={isMobile && editorOpen} onOpenChange={setEditorOpen}>
				<SheetContent
					side="right"
					className="w-[300px] p-0 flex flex-col lg:hidden"
				>
					<SheetTitle className="sr-only">Configuración</SheetTitle>
					{configPanel}
				</SheetContent>
			</Sheet>
		</div>
	);
}
