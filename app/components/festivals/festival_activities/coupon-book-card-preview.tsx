import Image from "next/image";

import { FitText } from "@/components/ui/fit-text";

type CouponBookCardPreviewProps = {
	imageUrl?: string | null;
	participantName?: string | null;
	standLabels?: string[];
	sectorName?: string | null;
	promoHighlight?: string;
	promoDescription?: string;
	promoConditions?: string | null;
};

export default function CouponBookCardPreview({
	imageUrl,
	participantName,
	standLabels = [],
	sectorName,
	promoHighlight,
	promoDescription,
	promoConditions,
}: CouponBookCardPreviewProps) {
	const standText = standLabels.length > 0 ? standLabels.join(" - ") : null;
	const hasHighlight = !!promoHighlight;

	const validityBase = "Válido durante el festival ";

	const validityLine = [validityBase, promoConditions?.trim() || null].filter(
		Boolean,
	);

	const validityText = validityLine.length > 0 ? validityLine.join("") : null;

	return (
		<div
			className="border-2 border-dashed border-gray-300 bg-white rounded-sm flex min-h-0 items-stretch overflow-hidden max-w-[240px] text-sm mx-auto"
			style={{ aspectRatio: "40 / 27" }}
		>
			{/* Left section */}
			<div className="flex flex-col items-center justify-center gap-1 px-3 py-2 shrink-0 w-[38%]">
				{imageUrl ? (
					<div className="relative w-12 h-12 rounded-full overflow-hidden shrink-0">
						<Image
							src={imageUrl}
							alt={participantName ?? "Participante"}
							fill
							className="object-cover"
						/>
					</div>
				) : (
					<div className="w-12 h-12 rounded-full bg-gray-300 shrink-0" />
				)}
				{standText && (
					<p className="font-bold text-sm text-gray-900 text-center leading-tight">
						Stand {standText}
					</p>
				)}
				{sectorName && (
					<p className="text-[10px] text-gray-500 text-center leading-tight">
						{sectorName}
					</p>
				)}
			</div>

			{/* Divider */}
			<div className="border-l-2 border-dashed border-gray-300 self-stretch" />

			{/* Right section: flex-1 promo fills height so validity stays flush to bottom */}
			<div className="flex h-full min-h-0 min-w-0 flex-1 flex-col px-3 py-2 overflow-hidden">
				<div className="flex min-h-0 min-w-0 flex-1 flex-col gap-0.5 overflow-hidden">
					{participantName && (
						<FitText
							mode="multi-line"
							minFontSizePx={10}
							maxFontSizePx={14}
							className="font-semibold leading-tight py-1 text-gray-900"
						>
							{participantName}
						</FitText>
					)}
					{hasHighlight ? (
						<>
							<FitText
								mode="single-line"
								minFontSizePx={12}
								maxFontSizePx={40}
								className="font-black leading-none text-gray-900"
							>
								{promoHighlight}
							</FitText>
							{promoDescription && (
								<FitText
									mode="single-line"
									minFontSizePx={9}
									maxFontSizePx={14}
									className="font-semibold leading-tight text-gray-700"
								>
									{promoDescription}
								</FitText>
							)}
						</>
					) : (
						<FitText
							mode="single-line"
							minFontSizePx={10}
							maxFontSizePx={20}
							className="font-black leading-tight text-gray-900"
						>
							{promoDescription || (
								<span className="text-gray-300">Tu promoción</span>
							)}
						</FitText>
					)}
				</div>
				{validityText && (
					<div className="mt-auto shrink-0 h-8 min-h-0 w-full overflow-hidden">
						<FitText
							mode="multi-line"
							minFontSizePx={9}
							maxFontSizePx={12}
							className="text-gray-400 leading-tight"
							wrapperClassName="h-full"
						>
							{validityText}
						</FitText>
					</div>
				)}
			</div>
		</div>
	);
}
