import { NextRequest } from "next/server";
import { z } from "zod";
import {
	COUPON_BOOK_PAGE_HEIGHT_CM,
	COUPON_BOOK_PAGE_WIDTH_CM,
	COURTESY_COUPON_ENTRY,
	CouponBookEntry,
	CouponBookPage,
	CouponTextLayoutConfig,
	DEFAULT_COUPON_TEXT_LAYOUT_CONFIG,
	buildCouponBookVariants,
	paginateCouponBookEntries,
} from "@/app/lib/festival_activites/coupon-book-builder";
import { fetchParticipationPreviewData } from "@/app/lib/festival_activites/actions";
import { fetchFestivalActivityForReview } from "@/app/lib/festivals/actions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

const ParamsSchema = z.object({
	id: z.coerce.number(),
	activityId: z.coerce.number(),
});

type PdfOrientation = "portrait" | "landscape";

function escapeHtml(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function parseMmSetting(
	value: string | null,
	fallback: number,
	min: number,
	max: number,
) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(max, Math.max(min, parsed));
}

function parseOrientation(value: string | null): PdfOrientation {
	return value === "portrait" ? "portrait" : "landscape";
}

function resolveTextLayoutConfig(
	searchParams: URLSearchParams,
): CouponTextLayoutConfig {
	return {
		leftColumnWidthPct: parseMmSetting(
			searchParams.get("leftColW"),
			DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.leftColumnWidthPct,
			20,
			60,
		),
		standFontSizeMm: parseMmSetting(
			searchParams.get("standFsMm"),
			DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.standFontSizeMm,
			1.5,
			5,
		),
		sectorFontSizeMm: parseMmSetting(
			searchParams.get("sectorFsMm"),
			DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.sectorFontSizeMm,
			1.5,
			5,
		),
		headerImageScalePct: parseMmSetting(
			searchParams.get("headerScalePct"),
			DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.headerImageScalePct,
			10,
			100,
		),
		nameBox: {
			xPct: parseMmSetting(
				searchParams.get("nameX"),
				DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.nameBox.xPct,
				0,
				100,
			),
			yPct: parseMmSetting(
				searchParams.get("nameY"),
				DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.nameBox.yPct,
				0,
				100,
			),
			widthPct: parseMmSetting(
				searchParams.get("nameW"),
				DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.nameBox.widthPct,
				10,
				100,
			),
			heightPct: parseMmSetting(
				searchParams.get("nameH"),
				DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.nameBox.heightPct,
				5,
				100,
			),
			multiline: searchParams.get("nameM")
				? searchParams.get("nameM") === "1"
				: DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.nameBox.multiline,
		},
		highlightBox: {
			xPct: parseMmSetting(
				searchParams.get("highlightX"),
				DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.highlightBox.xPct,
				0,
				100,
			),
			yPct: parseMmSetting(
				searchParams.get("highlightY"),
				DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.highlightBox.yPct,
				0,
				100,
			),
			widthPct: parseMmSetting(
				searchParams.get("highlightW"),
				DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.highlightBox.widthPct,
				10,
				100,
			),
			heightPct: parseMmSetting(
				searchParams.get("highlightH"),
				DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.highlightBox.heightPct,
				5,
				100,
			),
			multiline: searchParams.get("highlightM")
				? searchParams.get("highlightM") === "1"
				: DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.highlightBox.multiline,
		},
		descriptionBox: {
			xPct: parseMmSetting(
				searchParams.get("descriptionX"),
				DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.descriptionBox.xPct,
				0,
				100,
			),
			yPct: parseMmSetting(
				searchParams.get("descriptionY"),
				DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.descriptionBox.yPct,
				0,
				100,
			),
			widthPct: parseMmSetting(
				searchParams.get("descriptionW"),
				DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.descriptionBox.widthPct,
				10,
				100,
			),
			heightPct: parseMmSetting(
				searchParams.get("descriptionH"),
				DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.descriptionBox.heightPct,
				5,
				100,
			),
			multiline: searchParams.get("descriptionM")
				? searchParams.get("descriptionM") === "1"
				: DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.descriptionBox.multiline,
		},
		validityBox: {
			xPct: parseMmSetting(
				searchParams.get("validityX"),
				DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.validityBox.xPct,
				0,
				100,
			),
			yPct: parseMmSetting(
				searchParams.get("validityY"),
				DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.validityBox.yPct,
				0,
				100,
			),
			widthPct: parseMmSetting(
				searchParams.get("validityW"),
				DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.validityBox.widthPct,
				10,
				100,
			),
			heightPct: parseMmSetting(
				searchParams.get("validityH"),
				DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.validityBox.heightPct,
				5,
				100,
			),
			multiline: searchParams.get("validityM")
				? searchParams.get("validityM") === "1"
				: DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.validityBox.multiline,
		},
	};
}

function resolvePdfCanvas(searchParams: URLSearchParams) {
	const widthCm = parseMmSetting(
		searchParams.get("pdfWcm"),
		COUPON_BOOK_PAGE_WIDTH_CM,
		10,
		200,
	);
	const heightCm = parseMmSetting(
		searchParams.get("pdfHcm"),
		COUPON_BOOK_PAGE_HEIGHT_CM,
		10,
		200,
	);
	const orientation = parseOrientation(searchParams.get("pdfOrientation"));

	const longSide = Math.max(widthCm, heightCm);
	const shortSide = Math.min(widthCm, heightCm);
	const effectiveWidthCm =
		orientation === "landscape" ? longSide : shortSide;
	const effectiveHeightCm =
		orientation === "landscape" ? shortSide : longSide;

	return { widthCm: effectiveWidthCm, heightCm: effectiveHeightCm, orientation };
}

function cmToInches(cm: number): string {
	const inches = cm / 2.54;
	return `${inches.toFixed(6)}in`;
}

function renderCouponCard(
	entry: CouponBookEntry | null,
	textLayoutConfig: CouponTextLayoutConfig,
) {
	if (!entry) return "";
	const isCourtesyCoupon = entry.participationId === null;
	const standText =
		entry.standLabels.length > 0
			? `Stand ${escapeHtml(entry.standLabels.join(" - "))}`
			: "";
	const sector = entry.sectorName ? escapeHtml(entry.sectorName) : "";
	const participantName = escapeHtml(entry.participantName || "Participante");
	const highlight = escapeHtml(entry.promoHighlight || "");
	const description = escapeHtml(entry.promoDescription || "");
	const conditions = escapeHtml(entry.promoConditions?.trim() || "");
	const validityText = conditions || "Válido durante el evento";
	const boxStyle = (box: {
		xPct: number;
		yPct: number;
		widthPct: number;
		heightPct: number;
	}) =>
		`position:absolute;left:${box.xPct}%;top:${box.yPct}%;width:${box.widthPct}%;height:${box.heightPct}%;overflow:hidden;`;
	const imageHtml = entry.imageUrl
		? `<img src="${escapeHtml(entry.imageUrl)}" alt="${participantName}" style="width:100%;height:100%;object-fit:${isCourtesyCoupon ? "contain" : "cover"};" />`
		: "";

	return `
	<div style="background:#fff;border-radius:2px;display:flex;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;font-family:Arial,Helvetica,'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif;">
		<div style="width:${textLayoutConfig.leftColumnWidthPct}%;padding:3mm 1.6mm;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.8mm;text-align:center;min-width:0;min-height:0;">
			<div style="width:9mm;height:9mm;border-radius:9999px;background:${isCourtesyCoupon ? "#fff" : "#ddd"};overflow:hidden;flex-shrink:0;">${imageHtml}</div>
			${standText ? `<p style="font-size:${textLayoutConfig.standFontSizeMm}mm;font-weight:700;line-height:1.2;margin:0;">${standText}</p>` : ""}
			${sector ? `<p style="font-size:${textLayoutConfig.sectorFontSizeMm}mm;color:#666;line-height:1.2;margin:0;">${sector}</p>` : ""}
		</div>
		<div style="border-left:1px dashed #444;height:100%;"></div>
		<div style="flex:1;min-width:0;min-height:0;padding:2.4mm 2mm;position:relative;">
			<p data-fit-text="true" data-fit-min-px="8" data-fit-max-px="12" data-fit-single-line="${textLayoutConfig.nameBox.multiline ? "false" : "true"}" style="margin:0;font-size:12px;font-weight:700;line-height:1.2;white-space:${textLayoutConfig.nameBox.multiline ? "normal" : "nowrap"};${boxStyle(textLayoutConfig.nameBox)}">${participantName}</p>
			${
				highlight
					? `<p data-fit-text="true" data-fit-min-px="12" data-fit-max-px="30" data-fit-single-line="${textLayoutConfig.highlightBox.multiline ? "false" : "true"}" style="margin:0;font-size:30px;font-weight:900;line-height:1.2;white-space:${textLayoutConfig.highlightBox.multiline ? "normal" : "nowrap"};${boxStyle(textLayoutConfig.highlightBox)}">${highlight}</p>
					   <p data-fit-text="true" data-fit-min-px="8" data-fit-max-px="16" data-fit-single-line="${textLayoutConfig.descriptionBox.multiline ? "false" : "true"}" style="margin:0;font-size:16px;font-weight:700;line-height:1.2;white-space:${textLayoutConfig.descriptionBox.multiline ? "normal" : "nowrap"};${boxStyle(textLayoutConfig.descriptionBox)}">${description}</p>`
					: `<p data-fit-text="true" data-fit-min-px="8" data-fit-max-px="20" data-fit-single-line="${textLayoutConfig.descriptionBox.multiline ? "false" : "true"}" style="margin:0;font-size:20px;font-weight:800;line-height:1.2;white-space:${textLayoutConfig.descriptionBox.multiline ? "normal" : "nowrap"};${boxStyle(textLayoutConfig.descriptionBox)}">${description}</p>`
			}
			<p data-fit-text="true" data-fit-min-px="7" data-fit-max-px="11" data-fit-single-line="${textLayoutConfig.validityBox.multiline ? "false" : "true"}" style="margin:0;font-size:11px;color:#666;line-height:1.2;white-space:${textLayoutConfig.validityBox.multiline ? "normal" : "nowrap"};${boxStyle(textLayoutConfig.validityBox)}">${escapeHtml(validityText)}</p>
		</div>
	</div>`;
}

function renderCouponBookPage(
	page: CouponBookPage,
	textLayoutConfig: CouponTextLayoutConfig,
	headerImageUrl: string | null,
) {
	const body = page.bodyEntries
		.map((entry, index) => {
			const row = Math.floor(index / 5) + 2;
			const col = (index % 5) + 1;
			return `
				<div style="grid-row:${row};grid-column:${col};padding:1.2mm;${row < 6 ? "border-bottom:2px dashed #111;" : ""}${col < 5 ? "border-right:2px dashed #111;" : ""}z-index:1;min-width:0;min-height:0;">
					${renderCouponCard(entry, textLayoutConfig)}
				</div>
			`;
		})
		.join("");

	return `
	<div class="couponbook-page" style="position:relative;width:${COUPON_BOOK_PAGE_WIDTH_CM}cm;height:${COUPON_BOOK_PAGE_HEIGHT_CM}cm;background:#fff;overflow:hidden;box-sizing:border-box;border:1px solid #111;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));grid-template-rows:repeat(6,minmax(0,1fr));font-family:Arial,Helvetica,sans-serif;isolation:isolate;">
			<div style="grid-column:1 / span 3;grid-row:1;border-right:2px solid #111;border-bottom:2px dashed #111;min-width:0;min-height:0;overflow:hidden;position:relative;z-index:1;">
				${
					headerImageUrl
						? `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#fff;">
								<img src="${escapeHtml(headerImageUrl)}" alt="Header de cuponera" style="width:${textLayoutConfig.headerImageScalePct}%;height:${textLayoutConfig.headerImageScalePct}%;object-fit:contain;" />
						   </div>`
						: `<div style="width:100%;height:100%;padding:3.5mm 3mm;display:flex;align-items:center;justify-content:space-between;gap:2mm;">
								<div style="width:12mm;height:12mm;background:#f0e4d6;border-radius:2px;"></div>
								<p style="margin:0;font-size:10mm;font-weight:900;color:#d0021b;">Glitter</p>
								<div style="width:11mm;height:11mm;background:repeating-linear-gradient(45deg,#000 0,#000 1px,#fff 1px,#fff 2px);"></div>
						   </div>`
				}
			</div>
			<div style="grid-column:4;grid-row:1;padding:1.2mm;border-bottom:2px dashed #111;border-right:2px solid #111;min-width:0;min-height:0;z-index:1;">
				${renderCouponCard(COURTESY_COUPON_ENTRY, textLayoutConfig)}
			</div>
			<div style="grid-column:5;grid-row:1;padding:1.2mm;border-bottom:2px dashed #111;min-width:0;min-height:0;z-index:1;">
				${renderCouponCard(page.headerDynamicEntry, textLayoutConfig)}
			</div>

			${body}
	</div>`;
}

function renderSheetPage(
	couponBookPages: string[],
	sheetWidthCm: number,
	sheetHeightCm: number,
	slotsPerRow: number,
	slotsPerColumn: number,
) {
	return `
	<div class="sheet-page" style="width:${sheetWidthCm}cm;height:${sheetHeightCm}cm;overflow:hidden;display:grid;grid-template-columns:repeat(${slotsPerRow}, ${COUPON_BOOK_PAGE_WIDTH_CM}cm);grid-template-rows:repeat(${slotsPerColumn}, ${COUPON_BOOK_PAGE_HEIGHT_CM}cm);justify-content:center;align-content:center;justify-items:start;align-items:start;background:#fff;">
		${couponBookPages.join("")}
	</div>`;
}

export async function GET(
	request: NextRequest,
	context: { params: Promise<{ id: string; activityId: string }> },
) {
	const profile = await getCurrentUserProfile();
	if (
		!profile ||
		(profile.role !== "admin" && profile.role !== "festival_admin")
	) {
		return new Response("No autorizado", { status: 401 });
	}

	const validatedParams = ParamsSchema.safeParse(await context.params);
	if (!validatedParams.success) {
		return new Response("Parámetros inválidos", { status: 400 });
	}

	const searchParams = request.nextUrl.searchParams;
	const requestedDetailId = searchParams.get("detailId");
	const detailId = requestedDetailId ? Number(requestedDetailId) : null;
	const textLayoutConfig = resolveTextLayoutConfig(searchParams);
	const pdfCanvas = resolvePdfCanvas(searchParams);

	const { id, activityId } = validatedParams.data;
	const activity = await fetchFestivalActivityForReview(id, activityId);
	if (!activity) {
		return new Response("Actividad no encontrada", { status: 404 });
	}

	const variants = buildCouponBookVariants(activity);
	const selectedVariants =
		detailId === null
			? variants
			: variants.filter((variant) => variant.detailId === detailId);
	if (selectedVariants.length === 0) {
		return new Response("Variante no encontrada", { status: 404 });
	}

	const hydratedVariants = await Promise.all(
		selectedVariants.map(async (variant) => {
			const entries = await Promise.all(
				variant.entries.map(async (entry) => {
					if (!entry.participationId) return entry;
					const previewData = await fetchParticipationPreviewData(
						entry.participationId,
					);
					if (!previewData) return entry;
					return {
						...entry,
						imageUrl: previewData.imageUrl,
						participantName: previewData.participantName ?? entry.participantName,
						standLabels: previewData.standLabels,
						sectorName: previewData.sectorName,
					};
				}),
			);
			return { ...variant, entries };
		}),
	);

	const couponBookPagesHtml = hydratedVariants
		.flatMap((variant) =>
			paginateCouponBookEntries(variant.entries).map((pageData) =>
				renderCouponBookPage(
					pageData,
					textLayoutConfig,
					variant.headerImageUrl ?? null,
				),
			),
		);

	const slotsPerRow = Math.max(
		1,
		Math.floor(pdfCanvas.widthCm / COUPON_BOOK_PAGE_WIDTH_CM),
	);
	const slotsPerColumn = Math.max(
		1,
		Math.floor(pdfCanvas.heightCm / COUPON_BOOK_PAGE_HEIGHT_CM),
	);
	const slotsPerSheet = slotsPerRow * slotsPerColumn;

	const sheetPagesHtml: string[] = [];
	for (let i = 0; i < couponBookPagesHtml.length; i += slotsPerSheet) {
		sheetPagesHtml.push(
			renderSheetPage(
				couponBookPagesHtml.slice(i, i + slotsPerSheet),
				pdfCanvas.widthCm,
				pdfCanvas.heightCm,
				slotsPerRow,
				slotsPerColumn,
			),
		);
	}

	const pagesHtml = sheetPagesHtml.join("");

	const html = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <base href="${escapeHtml(request.nextUrl.origin)}/" />
    <style>
      @page { size: ${cmToInches(pdfCanvas.widthCm)} ${cmToInches(pdfCanvas.heightCm)}; margin: 0; }
      html, body { margin: 0; padding: 0; background: #fff; }
      .sheet-page { width: ${pdfCanvas.widthCm}cm; height: ${pdfCanvas.heightCm}cm; page-break-after: always; break-after: page; }
      .sheet-page:last-child { page-break-after: auto; break-after: auto; }
    </style>
  </head>
  <body>${pagesHtml}</body>
</html>`;

	let playwrightModule: typeof import("playwright");
	try {
		playwrightModule = await import("playwright");
	} catch (_error) {
		return new Response(
			"La exportación PDF requiere instalar la dependencia playwright",
			{ status: 500 },
		);
	}

	const browser = await playwrightModule.chromium.launch({
		headless: true,
		args: ["--no-sandbox", "--disable-setuid-sandbox"],
	});

	try {
		const page = await browser.newPage();
		await page.setContent(html, { waitUntil: "networkidle" });
		await page.evaluate(() => {
			const nodes = document.querySelectorAll<HTMLElement>(
				"[data-fit-text='true']",
			);
			nodes.forEach((el) => {
				const min = Number(el.dataset.fitMinPx ?? 8);
				const max = Number(el.dataset.fitMaxPx ?? 18);
				const step = Number(el.dataset.fitStepPx ?? 0.5);
				const singleLine = el.dataset.fitSingleLine === "true";
				const safeStep = Number.isFinite(step) && step > 0 ? step : 0.5;

				el.style.fontSize = `${max}px`;
				el.style.whiteSpace = singleLine ? "nowrap" : "normal";

				let size = max;
				while (size > min) {
					const overWidth = el.scrollWidth - 0.5 > el.clientWidth;
					const overHeight = el.scrollHeight - 0.5 > el.clientHeight;
					if (!overWidth && !overHeight) break;
					size -= safeStep;
					el.style.fontSize = `${size}px`;
				}
				if (size < min) {
					el.style.fontSize = `${min}px`;
				}
			});
		});
		const pdf = await page.pdf({
			width: cmToInches(pdfCanvas.widthCm),
			height: cmToInches(pdfCanvas.heightCm),
			printBackground: true,
			margin: { top: "0", right: "0", bottom: "0", left: "0" },
		});

		const suffix =
			detailId !== null ? `variante-${detailId}` : "todas-las-variantes";
		const fileName = `cuponera-${activityId}-${suffix}.pdf`;

		return new Response(new Uint8Array(pdf), {
			headers: {
				"Content-Type": "application/pdf",
				"Content-Disposition": `attachment; filename="${fileName}"`,
				"Cache-Control": "no-store",
			},
		});
	} finally {
		await browser.close();
	}
}
