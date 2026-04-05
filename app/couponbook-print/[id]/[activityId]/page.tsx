import CouponBookPrintPage from "@/app/components/festivals/festival_activities/coupon-book-print-page";
import { fetchParticipationPreviewData } from "@/app/lib/festival_activites/actions";
import {
	COUPON_BOOK_PAGE_HEIGHT_CM,
	COUPON_BOOK_PAGE_WIDTH_CM,
	buildCouponBookVariants,
	paginateCouponBookEntries,
} from "@/app/lib/festival_activites/coupon-book-builder";
import {
	resolveCouponTextLayoutConfig,
	resolvePdfCanvasConfig,
} from "@/app/lib/festival_activites/coupon-book-print-config";
import { fetchFestivalActivityForReview } from "@/app/lib/festivals/actions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { notFound } from "next/navigation";

type PageProps = {
	params: Promise<{ id: string; activityId: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function toSearchParams(
	params: Record<string, string | string[] | undefined>,
): URLSearchParams {
	const mapped = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (Array.isArray(value)) {
			for (const item of value) mapped.append(key, item);
			continue;
		}
		if (typeof value === "string") mapped.set(key, value);
	}
	return mapped;
}

function parseNumber(value: string | null): number | null {
	if (!value) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

export default async function CouponBookPrintDocumentPage({
	params,
	searchParams,
}: PageProps) {
	const profile = await getCurrentUserProfile();
	if (
		!profile ||
		(profile.role !== "admin" && profile.role !== "festival_admin")
	) {
		notFound();
	}

	const [resolvedParams, resolvedSearchParams] = await Promise.all([
		params,
		searchParams,
	]);
	const festivalId = Number(resolvedParams.id);
	const activityId = Number(resolvedParams.activityId);
	if (!Number.isFinite(festivalId) || !Number.isFinite(activityId)) {
		notFound();
	}

	const search = toSearchParams(resolvedSearchParams);
	const detailId = parseNumber(search.get("detailId"));
	const textLayoutConfig = resolveCouponTextLayoutConfig(search);
	const pdfCanvas = resolvePdfCanvasConfig(search);

	const activity = await fetchFestivalActivityForReview(festivalId, activityId);
	if (!activity) notFound();

	const variants = buildCouponBookVariants(activity);
	const selectedVariants =
		detailId === null
			? variants
			: variants.filter((variant) => variant.detailId === detailId);
	if (selectedVariants.length === 0) notFound();

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
						participantName:
							previewData.participantName ?? entry.participantName,
						standLabels: previewData.standLabels,
						sectorName: previewData.sectorName,
					};
				}),
			);
			return { ...variant, entries };
		}),
	);

	const couponBookPages = hydratedVariants.flatMap((variant) =>
		paginateCouponBookEntries(variant.entries).map((page) => ({
			page,
			headerImageUrl: variant.headerImageUrl ?? null,
		})),
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

	const sheets: Array<typeof couponBookPages> = [];
	for (let i = 0; i < couponBookPages.length; i += slotsPerSheet) {
		sheets.push(couponBookPages.slice(i, i + slotsPerSheet));
	}

	return (
		<div data-couponbook-print-ready="true" style={{ margin: 0, padding: 0 }}>
			<style>{`
				@media print {
					@page { margin: 0; }
				}
				html, body {
					margin: 0;
					padding: 0;
					background: #fff;
				}
				.couponbook-sheet {
					page-break-after: always;
					break-after: page;
				}
				.couponbook-sheet:last-child {
					page-break-after: auto;
					break-after: auto;
				}
			`}</style>

			{sheets.map((sheet, sheetIndex) => (
				<div
					key={`sheet-${sheetIndex}`}
					className="couponbook-sheet"
					style={{
						width: `${pdfCanvas.widthCm}cm`,
						height: `${pdfCanvas.heightCm}cm`,
						display: "grid",
						gridTemplateColumns: `repeat(${slotsPerRow}, ${COUPON_BOOK_PAGE_WIDTH_CM}cm)`,
						gridTemplateRows: `repeat(${slotsPerColumn}, ${COUPON_BOOK_PAGE_HEIGHT_CM}cm)`,
						justifyContent: "center",
						alignContent: "center",
						justifyItems: "start",
						alignItems: "start",
						overflow: "hidden",
						background: "#fff",
					}}
				>
					{sheet.map(({ page, headerImageUrl }) => (
						<CouponBookPrintPage
							key={`${page.pageNumber}-${headerImageUrl ?? "no-header"}-${page.headerDynamicEntry?.participationId ?? "empty"}`}
							page={page}
							textLayoutConfig={textLayoutConfig}
							headerImageUrl={headerImageUrl}
							headerImageScalePct={textLayoutConfig.headerImageScalePct}
						/>
					))}
				</div>
			))}
		</div>
	);
}
