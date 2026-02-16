import { MapElementLabelPosition } from "@/app/lib/map_elements/definitions";

type LabelLayout = {
	textX: number;
	textY: number;
	textAnchor: "middle" | "start" | "end";
	bgX: number;
	bgY: number;
};

/**
 * Compute label text + background position for a given label placement.
 * All coordinates are relative to the element's top-left (0,0).
 */
export function getLabelLayout(
	position: MapElementLabelPosition | undefined | null,
	width: number,
	height: number,
	fontSize: number,
	estTextWidth: number,
	padX: number,
): LabelLayout {
	const gap = 1;

	switch (position) {
		case "top":
			return {
				textX: width / 2,
				textY: -(fontSize / 2 + gap),
				textAnchor: "middle",
				bgX: width / 2 - estTextWidth / 2,
				bgY: -(fontSize + gap),
			};
		case "left":
			return {
				textX: -(estTextWidth / 2 + padX + gap),
				textY: height / 2,
				textAnchor: "middle",
				bgX: -(estTextWidth + padX * 2 + gap),
				bgY: height / 2 - fontSize / 2,
			};
		case "right":
			return {
				textX: width + estTextWidth / 2 + padX + gap,
				textY: height / 2,
				textAnchor: "middle",
				bgX: width + gap,
				bgY: height / 2 - fontSize / 2,
			};
		case "bottom":
		default:
			return {
				textX: width / 2,
				textY: height + fontSize / 2 + gap,
				textAnchor: "middle",
				bgX: width / 2 - estTextWidth / 2,
				bgY: height + gap,
			};
	}
}
