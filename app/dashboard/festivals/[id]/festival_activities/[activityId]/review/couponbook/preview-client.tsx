"use client";

import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type PointerEvent as ReactPointerEvent,
} from "react";

import CouponBookPrintPage from "@/app/components/festivals/festival_activities/coupon-book-print-page";
import {
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/components/ui/select";

type CouponBookPreviewClientProps = {
	festivalId: number;
	activityId: number;
	activityName: string;
	variants: CouponBookVariant[];
};

type BoxKey = "nameBox" | "highlightBox" | "descriptionBox" | "validityBox";
type DragMode = "move" | "resize";
type DragState = {
	boxKey: BoxKey;
	mode: DragMode;
	startX: number;
	startY: number;
	startBox: CouponTextBoxConfig;
};

type StoredCouponLayout = {
	textLayoutConfig: CouponTextLayoutConfig;
	activeBoxKey: BoxKey;
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

export default function CouponBookPreviewClient({
	festivalId,
	activityId,
	activityName,
	variants,
}: CouponBookPreviewClientProps) {
	const storageKey = `couponbook-layout:v1:festival:${festivalId}:activity:${activityId}`;

	const clamp = (value: number, min: number, max: number) =>
		Math.min(max, Math.max(min, value));

	const setBoxValue = (
		boxKey: BoxKey,
		field: keyof CouponTextBoxConfig,
		value: string,
		min: number,
		max: number,
	) => {
		const parsed = Number(value);
		if (!Number.isFinite(parsed)) return;
		const clamped = clamp(parsed, min, max);
		setTextLayoutConfig((prev) => ({
			...prev,
			[boxKey]: { ...prev[boxKey], [field]: clamped },
		}));
	};

	const setBoxMultiline = (boxKey: BoxKey, multiline: boolean) => {
		setTextLayoutConfig((prev) => ({
			...prev,
			[boxKey]: { ...prev[boxKey], multiline },
		}));
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

	const [selectedDetailId, setSelectedDetailId] = useState<number>(
		variants[0]?.detailId ?? 0,
	);
	const [selectedPageIndex, setSelectedPageIndex] = useState(0);
	const [previewScale, setPreviewScale] = useState(1);
	const [textLayoutConfig, setTextLayoutConfig] =
		useState<CouponTextLayoutConfig>(DEFAULT_COUPON_TEXT_LAYOUT_CONFIG);
	const [activeBoxKey, setActiveBoxKey] = useState<BoxKey>("nameBox");
	const [pdfCanvasConfig, setPdfCanvasConfig] = useState<PdfCanvasConfig>(
		DEFAULT_PDF_CANVAS_CONFIG,
	);
	const [storageHydrated, setStorageHydrated] = useState(false);
	const viewportRef = useRef<HTMLDivElement | null>(null);
	const pageFrameRef = useRef<HTMLDivElement | null>(null);
	const editorCanvasRef = useRef<HTMLDivElement | null>(null);
	const dragRef = useRef<DragState | null>(null);

	useEffect(() => {
		try {
			const raw = window.localStorage.getItem(storageKey);
			if (raw) {
				const parsed = JSON.parse(raw) as Partial<StoredCouponLayout>;
				if (parsed.textLayoutConfig) {
					setTextLayoutConfig((prev) => ({
						...prev,
						...parsed.textLayoutConfig,
						nameBox: {
							...prev.nameBox,
							...parsed.textLayoutConfig?.nameBox,
						},
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
				if (
					parsed.activeBoxKey === "nameBox" ||
					parsed.activeBoxKey === "highlightBox" ||
					parsed.activeBoxKey === "descriptionBox" ||
					parsed.activeBoxKey === "validityBox"
				) {
					setActiveBoxKey(parsed.activeBoxKey);
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

	useEffect(() => {
		if (!storageHydrated) return;
		try {
			const payload: StoredCouponLayout = {
				textLayoutConfig,
				activeBoxKey,
				pdfCanvasConfig,
			};
			window.localStorage.setItem(storageKey, JSON.stringify(payload));
		} catch {
			// Ignore storage errors (private mode/quota) and continue.
		}
	}, [
		storageHydrated,
		storageKey,
		textLayoutConfig,
		activeBoxKey,
		pdfCanvasConfig,
	]);

	const selectedVariant = useMemo(
		() => variants.find((variant) => variant.detailId === selectedDetailId),
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
		const widthCm =
			pdfCanvasConfig.orientation === "landscape" ? longSide : shortSide;
		const heightCm =
			pdfCanvasConfig.orientation === "landscape" ? shortSide : longSide;
		return { widthCm, heightCm };
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

	useEffect(() => {
		const updateScale = () => {
			const viewportEl = viewportRef.current;
			const pageEl = pageFrameRef.current;
			if (!viewportEl || !pageEl) return;

			const viewportWidth = viewportEl.clientWidth;
			if (viewportWidth <= 0) return;

			// offsetWidth is layout width and does not include CSS transforms.
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
	}, [selectedPageIndex, selectedDetailId]);

	useEffect(() => {
		const frame = pageFrameRef.current;
		if (!frame) return;

		// Run after paint so measurements reflect final layout.
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

	useEffect(() => {
		const onPointerMove = (event: PointerEvent) => {
			const drag = dragRef.current;
			const canvas = editorCanvasRef.current;
			if (!drag || !canvas) return;

			const rect = canvas.getBoundingClientRect();
			if (rect.width <= 0 || rect.height <= 0) return;

			const dxPct = ((event.clientX - drag.startX) / rect.width) * 100;
			const dyPct = ((event.clientY - drag.startY) / rect.height) * 100;

			setTextLayoutConfig((prev) => {
				const current = prev[drag.boxKey];
				if (!current) return prev;

				if (drag.mode === "move") {
					const nextX = clamp(
						drag.startBox.xPct + dxPct,
						0,
						100 - current.widthPct,
					);
					const nextY = clamp(
						drag.startBox.yPct + dyPct,
						0,
						100 - current.heightPct,
					);
					return {
						...prev,
						[drag.boxKey]: { ...current, xPct: nextX, yPct: nextY },
					};
				}

				const nextW = clamp(
					drag.startBox.widthPct + dxPct,
					5,
					100 - current.xPct,
				);
				const nextH = clamp(
					drag.startBox.heightPct + dyPct,
					5,
					100 - current.yPct,
				);
				return {
					...prev,
					[drag.boxKey]: { ...current, widthPct: nextW, heightPct: nextH },
				};
			});
		};

		const onPointerUp = () => {
			dragRef.current = null;
		};

		window.addEventListener("pointermove", onPointerMove);
		window.addEventListener("pointerup", onPointerUp);
		return () => {
			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("pointerup", onPointerUp);
		};
	}, []);

	const startDrag = (
		event: ReactPointerEvent<HTMLDivElement>,
		boxKey: BoxKey,
		mode: DragMode,
	) => {
		event.preventDefault();
		event.stopPropagation();
		setActiveBoxKey(boxKey);
		dragRef.current = {
			boxKey,
			mode,
			startX: event.clientX,
			startY: event.clientY,
			startBox: textLayoutConfig[boxKey],
		};
	};

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

	if (variants.length === 0) {
		return (
			<div className="rounded-md border p-4 text-sm text-muted-foreground">
				No hay variantes disponibles para generar cuponera.
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-2 flex-wrap">
				<Select
					value={String(selectedDetailId)}
					onValueChange={(value) => {
						setSelectedDetailId(Number(value));
						setSelectedPageIndex(0);
					}}
				>
					<SelectTrigger className="w-[260px]">
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

				<Select
					value={String(selectedPageIndex)}
					onValueChange={(value) => setSelectedPageIndex(Number(value))}
					disabled={pages.length <= 1}
				>
					<SelectTrigger className="w-[180px]">
						<SelectValue placeholder="Página" />
					</SelectTrigger>
					<SelectContent>
						{pages.map((page, index) => (
							<SelectItem key={`page-${page.pageNumber}`} value={String(index)}>
								Página {page.pageNumber} / {page.totalPages}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Button asChild variant="outline">
					<a href={exportUrl}>Descargar PDF variante</a>
				</Button>

				<Button asChild>
					<a href={exportAllUrl}>Descargar PDF todas las variantes</a>
				</Button>
			</div>

			<div className="text-xs text-muted-foreground">
				Actividad: {activityName} · Estado incluido: aprobadas + pendientes de
				revisión
			</div>

			<div className="rounded-md border p-3 bg-background space-y-2">
				<p className="text-sm font-medium">Lienzo PDF</p>
				<div className="grid grid-cols-1 md:grid-cols-3 gap-2">
					<label className="text-xs flex flex-col gap-1">
						Ancho hoja (cm)
						<input
							className="h-9 rounded-md border px-2"
							type="number"
							step="0.01"
							min="10"
							max="200"
							value={pdfCanvasConfig.widthCm}
							onChange={(event) =>
								setPdfCanvasConfig((prev) => ({
									...prev,
									widthCm: clamp(
										Number(event.target.value) || prev.widthCm,
										10,
										200,
									),
								}))
							}
						/>
					</label>
					<label className="text-xs flex flex-col gap-1">
						Alto hoja (cm)
						<input
							className="h-9 rounded-md border px-2"
							type="number"
							step="0.01"
							min="10"
							max="200"
							value={pdfCanvasConfig.heightCm}
							onChange={(event) =>
								setPdfCanvasConfig((prev) => ({
									...prev,
									heightCm: clamp(
										Number(event.target.value) || prev.heightCm,
										10,
										200,
									),
								}))
							}
						/>
					</label>
					<label className="text-xs flex flex-col gap-1">
						Orientación
						<select
							className="h-9 rounded-md border px-2 bg-transparent"
							value={pdfCanvasConfig.orientation}
							onChange={(event) =>
								setPdfCanvasConfig((prev) => ({
									...prev,
									orientation:
										event.target.value === "portrait"
											? "portrait"
											: "landscape",
								}))
							}
						>
							<option value="landscape">Horizontal</option>
							<option value="portrait">Vertical</option>
						</select>
					</label>
				</div>
				<p className="text-xs text-muted-foreground">
					Entran aprox. {estimatedPerSheet.total} cuponera(s) por hoja (
					{estimatedPerSheet.cols} x {estimatedPerSheet.rows}) con tamano real
					de {COUPON_BOOK_PAGE_WIDTH_CM}cm x {COUPON_BOOK_PAGE_HEIGHT_CM}cm por
					cuponera.
				</p>
			</div>

			<div className="rounded-md border p-3 bg-background space-y-2">
				<p className="text-sm font-medium">Columna izquierda del cupon</p>
				<div className="grid grid-cols-1 md:grid-cols-3 gap-2">
					<label className="text-xs flex flex-col gap-1">
						Ancho columna izquierda (%)
						<input
							className="h-9 rounded-md border px-2"
							type="number"
							step="1"
							min="20"
							max="60"
							value={textLayoutConfig.leftColumnWidthPct}
							onChange={(event) =>
								setRootValue("leftColumnWidthPct", event.target.value, 20, 60)
							}
						/>
					</label>
					<label className="text-xs flex flex-col gap-1">
						Font Stand (mm)
						<input
							className="h-9 rounded-md border px-2"
							type="number"
							step="0.1"
							min="1.5"
							max="5"
							value={textLayoutConfig.standFontSizeMm}
							onChange={(event) =>
								setRootValue("standFontSizeMm", event.target.value, 1.5, 5)
							}
						/>
					</label>
					<label className="text-xs flex flex-col gap-1">
						Font Sector (mm)
						<input
							className="h-9 rounded-md border px-2"
							type="number"
							step="0.1"
							min="1.5"
							max="5"
							value={textLayoutConfig.sectorFontSizeMm}
							onChange={(event) =>
								setRootValue("sectorFontSizeMm", event.target.value, 1.5, 5)
							}
						/>
					</label>
				</div>
				<div className="grid grid-cols-1 md:grid-cols-3 gap-2">
					<label className="text-xs flex flex-col gap-1">
						Escala imagen header (%)
						<input
							className="h-9 rounded-md border px-2"
							type="number"
							step="1"
							min="10"
							max="100"
							value={textLayoutConfig.headerImageScalePct}
							onChange={(event) =>
								setRootValue("headerImageScalePct", event.target.value, 10, 100)
							}
						/>
					</label>
				</div>
			</div>

			<div className="rounded-md border p-3 bg-background space-y-2">
				<p className="text-sm font-medium">
					Cajas de texto (similar a Figma, porcentajes dentro del area de texto)
				</p>
				<div className="rounded-md border bg-muted/30 p-2">
					<p className="text-xs text-muted-foreground mb-2">
						Editor visual: arrastra cada caja para moverla y usa el cuadrado de
						la esquina para redimensionar.
					</p>
					<div className="flex justify-center">
						<div
							ref={editorCanvasRef}
							className="relative border bg-white"
							style={{ width: 300, height: 190 }}
						>
							{(
								[
									["nameBox", "Nombre"],
									["highlightBox", "Destacado"],
									["descriptionBox", "Descripcion"],
									["validityBox", "Validez"],
								] as const
							).map(([key, label]) => {
								const box = textLayoutConfig[key];
								const isActive = activeBoxKey === key;
								return (
									<div
										key={`editor-${key}`}
										role="button"
										tabIndex={0}
										onPointerDown={(event) => startDrag(event, key, "move")}
										onClick={() => setActiveBoxKey(key)}
										className="absolute select-none"
										style={{
											left: `${box.xPct}%`,
											top: `${box.yPct}%`,
											width: `${box.widthPct}%`,
											height: `${box.heightPct}%`,
											border: isActive
												? "2px solid #2563eb"
												: "1px solid #6b7280",
											background: isActive
												? "rgba(37,99,235,0.14)"
												: "rgba(107,114,128,0.10)",
											cursor: "move",
											boxSizing: "border-box",
										}}
									>
										<span className="absolute left-1 top-0.5 text-[10px] font-medium leading-none text-slate-700">
											{label}
										</span>
										<div
											onPointerDown={(event) => startDrag(event, key, "resize")}
											className="absolute right-0 bottom-0 h-3 w-3 bg-blue-600"
											style={{ cursor: "nwse-resize" }}
										/>
									</div>
								);
							})}
						</div>
					</div>
				</div>
				{(
					[
						["nameBox", "Nombre"],
						["highlightBox", "Destacado"],
						["descriptionBox", "Descripcion"],
						["validityBox", "Validez"],
					] as const
				).map(([key, label]) => {
					const box = textLayoutConfig[key];
					return (
						<div
							key={key}
							className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end"
						>
							<p className="text-xs font-medium md:col-span-1">{label}</p>
							<label className="text-xs flex flex-col gap-1">
								X%
								<input
									className="h-9 rounded-md border px-2"
									type="number"
									step="1"
									min="0"
									max="100"
									value={box.xPct}
									onChange={(event) =>
										setBoxValue(key, "xPct", event.target.value, 0, 100)
									}
								/>
							</label>
							<label className="text-xs flex flex-col gap-1">
								Y%
								<input
									className="h-9 rounded-md border px-2"
									type="number"
									step="1"
									min="0"
									max="100"
									value={box.yPct}
									onChange={(event) =>
										setBoxValue(key, "yPct", event.target.value, 0, 100)
									}
								/>
							</label>
							<label className="text-xs flex flex-col gap-1">
								W%
								<input
									className="h-9 rounded-md border px-2"
									type="number"
									step="1"
									min="10"
									max="100"
									value={box.widthPct}
									onChange={(event) =>
										setBoxValue(key, "widthPct", event.target.value, 10, 100)
									}
								/>
							</label>
							<label className="text-xs flex flex-col gap-1">
								H%
								<input
									className="h-9 rounded-md border px-2"
									type="number"
									step="1"
									min="5"
									max="100"
									value={box.heightPct}
									onChange={(event) =>
										setBoxValue(key, "heightPct", event.target.value, 5, 100)
									}
								/>
							</label>
							<label className="text-xs flex items-center gap-2 md:self-end">
								<input
									type="checkbox"
									checked={box.multiline}
									onChange={(event) =>
										setBoxMultiline(key, event.target.checked)
									}
								/>
								Multilinea
							</label>
						</div>
					);
				})}
			</div>

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
										headerImageScalePct={textLayoutConfig.headerImageScalePct}
									/>
								) : null}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
