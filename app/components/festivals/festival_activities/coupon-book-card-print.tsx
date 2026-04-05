import {
	CouponBookEntry,
	CouponTextLayoutConfig,
	DEFAULT_COUPON_TEXT_LAYOUT_CONFIG,
} from "@/app/lib/festival_activites/coupon-book-builder";

type CouponBookCardPrintProps = {
	entry: CouponBookEntry;
	textLayoutConfig?: CouponTextLayoutConfig;
};

export default function CouponBookCardPrint({
	entry,
	textLayoutConfig = DEFAULT_COUPON_TEXT_LAYOUT_CONFIG,
}: CouponBookCardPrintProps) {
	const isCourtesyCoupon = entry.participationId === null;
	const standText =
		entry.standLabels.length > 0 ? entry.standLabels.join(" - ") : null;
	const hasHighlight = entry.promoHighlight.trim().length > 0;
	const trimmedConditions = entry.promoConditions?.trim() ?? "";
	const validityText = trimmedConditions || "Válido durante el evento";

	const boxStyle = (box: {
		xPct: number;
		yPct: number;
		widthPct: number;
		heightPct: number;
	}) => ({
		position: "absolute" as const,
		left: `${box.xPct}%`,
		top: `${box.yPct}%`,
		width: `${box.widthPct}%`,
		height: `${box.heightPct}%`,
		overflow: "hidden" as const,
	});

	return (
		<div
			style={{
				background: "#fff",
				borderRadius: "2px",
				display: "flex",
				width: "100%",
				height: "100%",
				minWidth: 0,
				minHeight: 0,
				overflow: "hidden",
				fontFamily:
					'Arial, Helvetica, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
			}}
		>
			<div
				style={{
					width: `${textLayoutConfig.leftColumnWidthPct}%`,
					padding: "3mm 1.6mm",
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					gap: "0.8mm",
					textAlign: "center",
					minWidth: 0,
					minHeight: 0,
				}}
			>
				<div
					style={{
						width: "9mm",
						height: "9mm",
						borderRadius: "9999px",
						background: isCourtesyCoupon ? "#fff" : "#ddd",
						overflow: "hidden",
						flexShrink: 0,
					}}
				>
					{entry.imageUrl ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img
							src={entry.imageUrl}
							alt={entry.participantName}
							style={{
								width: "100%",
								height: "100%",
								objectFit: isCourtesyCoupon ? "contain" : "cover",
							}}
						/>
					) : null}
				</div>
				{standText ? (
					<p
						style={{
							fontSize: `${textLayoutConfig.standFontSizeMm}mm`,
							fontWeight: 700,
							lineHeight: 1.2,
							margin: 0,
						}}
					>
						Stand {standText}
					</p>
				) : null}
				{entry.sectorName ? (
					<p
						style={{
							fontSize: `${textLayoutConfig.sectorFontSizeMm}mm`,
							color: "#666",
							lineHeight: 1.2,
							margin: 0,
						}}
					>
						{entry.sectorName}
					</p>
				) : null}
			</div>
			<div style={{ borderLeft: "1px dashed #444", height: "100%" }} />
			<div
				style={{
					flex: 1,
					minWidth: 0,
					minHeight: 0,
					padding: "2.4mm 2mm",
					position: "relative",
				}}
			>
				<p
					data-fit-text="true"
					data-fit-min-px="8"
					data-fit-max-px="12"
					data-fit-single-line={
						textLayoutConfig.nameBox.multiline ? "false" : "true"
					}
					style={{
						margin: 0,
						fontSize: "12px",
						fontWeight: 700,
						lineHeight: 1.2,
						whiteSpace: textLayoutConfig.nameBox.multiline
							? "normal"
							: "nowrap",
						...boxStyle(textLayoutConfig.nameBox),
					}}
				>
					{entry.participantName}
				</p>
				{hasHighlight ? (
					<>
						<p
							data-fit-text="true"
							data-fit-min-px="12"
							data-fit-max-px="30"
							data-fit-single-line={
								textLayoutConfig.highlightBox.multiline ? "false" : "true"
							}
							style={{
								margin: 0,
								fontSize: "30px",
								fontWeight: 900,
								lineHeight: 1.2,
								whiteSpace: textLayoutConfig.highlightBox.multiline
									? "normal"
									: "nowrap",
								...boxStyle(textLayoutConfig.highlightBox),
							}}
						>
							{entry.promoHighlight}
						</p>
						<p
							data-fit-text="true"
							data-fit-min-px="8"
							data-fit-max-px="16"
							data-fit-single-line={
								textLayoutConfig.descriptionBox.multiline ? "false" : "true"
							}
							style={{
								margin: 0,
								fontSize: "16px",
								fontWeight: 700,
								lineHeight: 1.2,
								whiteSpace: textLayoutConfig.descriptionBox.multiline
									? "normal"
									: "nowrap",
								...boxStyle(textLayoutConfig.descriptionBox),
							}}
						>
							{entry.promoDescription}
						</p>
					</>
				) : (
					<p
						data-fit-text="true"
						data-fit-min-px="8"
						data-fit-max-px="20"
						data-fit-single-line={
							textLayoutConfig.descriptionBox.multiline ? "false" : "true"
						}
						style={{
							margin: 0,
							fontSize: "20px",
							fontWeight: 800,
							lineHeight: 1.2,
							whiteSpace: textLayoutConfig.descriptionBox.multiline
								? "normal"
								: "nowrap",
							...boxStyle(textLayoutConfig.descriptionBox),
						}}
					>
						{entry.promoDescription}
					</p>
				)}
				<p
					data-fit-text="true"
					data-fit-min-px="7"
					data-fit-max-px="11"
					data-fit-single-line={
						textLayoutConfig.validityBox.multiline ? "false" : "true"
					}
					style={{
						margin: 0,
						fontSize: "11px",
						color: "#666",
						lineHeight: 1.2,
						whiteSpace: textLayoutConfig.validityBox.multiline
							? "normal"
							: "nowrap",
						...boxStyle(textLayoutConfig.validityBox),
					}}
				>
					{validityText}
				</p>
			</div>
		</div>
	);
}
