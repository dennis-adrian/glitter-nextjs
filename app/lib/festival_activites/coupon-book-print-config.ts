import {
	COUPON_BOOK_PAGE_HEIGHT_CM,
	COUPON_BOOK_PAGE_WIDTH_CM,
	CouponTextLayoutConfig,
	DEFAULT_COUPON_TEXT_LAYOUT_CONFIG,
} from "@/app/lib/festival_activites/coupon-book-builder";

export type PdfOrientation = "portrait" | "landscape";

export type PdfCanvasConfig = {
	widthCm: number;
	heightCm: number;
	orientation: PdfOrientation;
};

function parseNumberSetting(
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

export function resolveCouponTextLayoutConfig(
	searchParams: URLSearchParams,
): CouponTextLayoutConfig {
	return {
		leftColumnWidthPct: parseNumberSetting(
			searchParams.get("leftColW"),
			DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.leftColumnWidthPct,
			20,
			60,
		),
		standFontSizeMm: parseNumberSetting(
			searchParams.get("standFsMm"),
			DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.standFontSizeMm,
			1.5,
			5,
		),
		sectorFontSizeMm: parseNumberSetting(
			searchParams.get("sectorFsMm"),
			DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.sectorFontSizeMm,
			1.5,
			5,
		),
		headerImageScalePct: parseNumberSetting(
			searchParams.get("headerScalePct"),
			DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.headerImageScalePct,
			10,
			100,
		),
		nameBox: {
			xPct: parseNumberSetting(
				searchParams.get("nameX"),
				DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.nameBox.xPct,
				0,
				100,
			),
			yPct: parseNumberSetting(
				searchParams.get("nameY"),
				DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.nameBox.yPct,
				0,
				100,
			),
			widthPct: parseNumberSetting(
				searchParams.get("nameW"),
				DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.nameBox.widthPct,
				10,
				100,
			),
			heightPct: parseNumberSetting(
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
			xPct: parseNumberSetting(
				searchParams.get("highlightX"),
				DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.highlightBox.xPct,
				0,
				100,
			),
			yPct: parseNumberSetting(
				searchParams.get("highlightY"),
				DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.highlightBox.yPct,
				0,
				100,
			),
			widthPct: parseNumberSetting(
				searchParams.get("highlightW"),
				DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.highlightBox.widthPct,
				10,
				100,
			),
			heightPct: parseNumberSetting(
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
			xPct: parseNumberSetting(
				searchParams.get("descriptionX"),
				DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.descriptionBox.xPct,
				0,
				100,
			),
			yPct: parseNumberSetting(
				searchParams.get("descriptionY"),
				DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.descriptionBox.yPct,
				0,
				100,
			),
			widthPct: parseNumberSetting(
				searchParams.get("descriptionW"),
				DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.descriptionBox.widthPct,
				10,
				100,
			),
			heightPct: parseNumberSetting(
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
			xPct: parseNumberSetting(
				searchParams.get("validityX"),
				DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.validityBox.xPct,
				0,
				100,
			),
			yPct: parseNumberSetting(
				searchParams.get("validityY"),
				DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.validityBox.yPct,
				0,
				100,
			),
			widthPct: parseNumberSetting(
				searchParams.get("validityW"),
				DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.validityBox.widthPct,
				10,
				100,
			),
			heightPct: parseNumberSetting(
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

export function resolvePdfCanvasConfig(
	searchParams: URLSearchParams,
): PdfCanvasConfig {
	const parsedWidthCm = parseNumberSetting(
		searchParams.get("pdfWcm"),
		COUPON_BOOK_PAGE_WIDTH_CM,
		10,
		200,
	);
	const parsedHeightCm = parseNumberSetting(
		searchParams.get("pdfHcm"),
		COUPON_BOOK_PAGE_HEIGHT_CM,
		10,
		200,
	);
	const orientation = parseOrientation(searchParams.get("pdfOrientation"));

	const longSide = Math.max(parsedWidthCm, parsedHeightCm);
	const shortSide = Math.min(parsedWidthCm, parsedHeightCm);

	if (orientation === "landscape") {
		return {
			widthCm: Math.max(longSide, COUPON_BOOK_PAGE_WIDTH_CM),
			heightCm: Math.max(shortSide, COUPON_BOOK_PAGE_HEIGHT_CM),
			orientation,
		};
	}

	const clampedWidthCm = Math.max(shortSide, COUPON_BOOK_PAGE_WIDTH_CM);
	const clampedHeightCm = Math.max(
		longSide,
		COUPON_BOOK_PAGE_HEIGHT_CM,
		clampedWidthCm,
	);
	return {
		widthCm: clampedWidthCm,
		heightCm: clampedHeightCm,
		orientation,
	};
}

export function cmToInches(cm: number): string {
	return `${(cm / 2.54).toFixed(6)}in`;
}
