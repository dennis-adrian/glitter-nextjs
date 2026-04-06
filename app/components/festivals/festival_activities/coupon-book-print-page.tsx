import CouponBookCardPrint from "@/app/components/festivals/festival_activities/coupon-book-card-print";
import {
	COUPON_BOOK_PAGE_HEIGHT_CM,
	COUPON_BOOK_PAGE_WIDTH_CM,
	COURTESY_COUPON_ENTRY,
	CouponBookPage,
	CouponTextLayoutConfig,
	DEFAULT_COUPON_TEXT_LAYOUT_CONFIG,
} from "@/app/lib/festival_activites/coupon-book-builder";

type CouponBookPrintPageProps = {
	page: CouponBookPage;
	textLayoutConfig?: CouponTextLayoutConfig;
	headerImageUrl?: string | null;
	headerImageScalePct?: number;
};

export default function CouponBookPrintPage({
	page,
	textLayoutConfig = DEFAULT_COUPON_TEXT_LAYOUT_CONFIG,
	headerImageUrl = null,
	headerImageScalePct = DEFAULT_COUPON_TEXT_LAYOUT_CONFIG.headerImageScalePct,
}: CouponBookPrintPageProps) {
	return (
		<div
			style={{
				position: "relative",
				width: `${COUPON_BOOK_PAGE_WIDTH_CM}cm`,
				height: `${COUPON_BOOK_PAGE_HEIGHT_CM}cm`,
				background: "white",
				overflow: "hidden",
				boxSizing: "border-box",
				border: "1px solid #111",
				display: "grid",
				gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
				gridTemplateRows: "repeat(6, minmax(0, 1fr))",
				fontFamily: "Arial, Helvetica, sans-serif",
				isolation: "isolate",
			}}
		>
			{/* Header image area (3 columns) */}
			<div
				style={{
					gridColumn: "1 / span 3",
					gridRow: "1",
					borderRight: "2px solid #111",
					borderBottom: "2px dashed #111",
					minWidth: 0,
					minHeight: 0,
					overflow: "hidden",
					position: "relative",
					zIndex: 1,
				}}
			>
				{headerImageUrl ? (
					<div
						style={{
							width: "100%",
							height: "100%",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							background: "#fff",
						}}
					>
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src={headerImageUrl}
							alt="Header de cuponera"
							style={{
								width: `${headerImageScalePct}%`,
								height: `${headerImageScalePct}%`,
								objectFit: "contain",
							}}
						/>
					</div>
				) : (
					<div
						style={{
							width: "100%",
							height: "100%",
							padding: "3.5mm 3mm",
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							gap: "2mm",
						}}
					>
						<div
							style={{
								width: "12mm",
								height: "12mm",
								background: "#f0e4d6",
								borderRadius: "2px",
							}}
						/>
						<p style={{ margin: 0, fontSize: "10mm", fontWeight: 900, color: "#d0021b" }}>
							Glitter
						</p>
						<div
							style={{
								width: "11mm",
								height: "11mm",
								background:
									"repeating-linear-gradient(45deg, #000 0, #000 1px, #fff 1px, #fff 2px)",
							}}
						/>
					</div>
				)}
			</div>

			{/* Header slot A: fixed courtesy sample */}
			<div
				style={{
					gridColumn: "4",
					gridRow: "1",
					padding: "1.2mm",
					borderBottom: "2px dashed #111",
					borderRight: "2px solid #111",
					minWidth: 0,
					minHeight: 0,
					zIndex: 1,
				}}
			>
				<CouponBookCardPrint
					entry={COURTESY_COUPON_ENTRY}
					textLayoutConfig={textLayoutConfig}
				/>
			</div>

			{/* Header slot B: first dynamic coupon */}
			<div
				style={{
					gridColumn: "5",
					gridRow: "1",
					padding: "1.2mm",
					borderBottom: "2px dashed #111",
					minWidth: 0,
					minHeight: 0,
					zIndex: 1,
				}}
			>
				{page.headerDynamicEntry ? (
					<CouponBookCardPrint
						entry={page.headerDynamicEntry}
						textLayoutConfig={textLayoutConfig}
					/>
				) : null}
			</div>

			{/* Body grid */}
			{page.bodyEntries.map((entry, index) => {
				const row = Math.floor(index / 5) + 2; // rows 2..6
				const col = (index % 5) + 1;
				return (
					<div
						key={`body-slot-${index}`}
						style={{
							gridRow: row,
							gridColumn: col,
							padding: "1.2mm",
							borderBottom: row < 6 ? "2px dashed #111" : undefined,
							borderRight: col < 5 ? "2px dashed #111" : undefined,
							zIndex: 1,
							minWidth: 0,
							minHeight: 0,
						}}
					>
						{entry ? (
							<CouponBookCardPrint
								entry={entry}
								textLayoutConfig={textLayoutConfig}
							/>
						) : null}
					</div>
				);
			})}

		</div>
	);
}
