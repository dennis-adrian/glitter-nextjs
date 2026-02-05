import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { MapCanvasConfig } from "./map-types";

// Default canvas config
export const DEFAULT_CANVAS_CONFIG: MapCanvasConfig = {
	minX: 0,
	minY: 0,
	width: 100,
	height: 100,
	backgroundColor: "#f5f3ef",
};

// Uniform square size for all stands (in viewBox units)
export const STAND_SIZE = 6;

export function getStandPosition(stand: StandWithReservationsWithParticipants) {
	return {
		left: stand.positionLeft ?? 0,
		top: stand.positionTop ?? 0,
	};
}

export function computeCanvasBounds(
	stands: StandWithReservationsWithParticipants[],
): { minX: number; minY: number; width: number; height: number } {
	const positioned = stands.filter(
		(s) => s.positionLeft != null && s.positionTop != null,
	);

	if (positioned.length === 0) {
		return { minX: 0, minY: 0, width: 50, height: 50 };
	}

	let minLeft = Infinity;
	let minTop = Infinity;
	let maxRight = -Infinity;
	let maxBottom = -Infinity;

	for (const stand of positioned) {
		const { left, top } = getStandPosition(stand);
		minLeft = Math.min(minLeft, left);
		minTop = Math.min(minTop, top);
		maxRight = Math.max(maxRight, left + STAND_SIZE);
		maxBottom = Math.max(maxBottom, top + STAND_SIZE);
	}

	const padding = 2;
	return {
		minX: minLeft - padding,
		minY: minTop - padding,
		width: maxRight - minLeft + 2 * padding,
		height: maxBottom - minTop + 2 * padding,
	};
}

export function getStandFillColor(
	status: string,
	canBeReserved: boolean,
): string {
	switch (status) {
		case "reserved":
			return "rgba(110, 231, 183, 0.35)"; // emerald-300/35
		case "confirmed":
			return "rgba(244, 63, 94, 0.35)"; // rose-500/35
		case "disabled":
			return "rgba(39, 39, 42, 0.4)"; // zinc-800/40
		default:
			return canBeReserved
				? "rgba(254, 243, 199, 0.01)"
				: "rgba(39, 39, 42, 0.4)";
	}
}

export function getStandHoverFillColor(
	status: string,
	canBeReserved: boolean,
): string {
	switch (status) {
		case "reserved":
			return "rgba(110, 231, 183, 0.5)"; // emerald-300/50
		case "confirmed":
			return "rgba(244, 63, 94, 0.5)"; // rose-500/50
		case "disabled":
			return "rgba(39, 39, 42, 0.5)"; // zinc-800/50
		default:
			return canBeReserved
				? "rgba(254, 243, 199, 0.6)"
				: "rgba(39, 39, 42, 0.5)";
	}
}

export function getStandStrokeColor(
	status: string,
	canBeReserved: boolean,
): string {
	switch (status) {
		case "reserved":
			return "rgba(52, 211, 153, 0.8)"; // emerald-400
		case "confirmed":
			return "rgba(244, 63, 94, 0.8)"; // rose-500
		case "disabled":
			return "rgba(113, 113, 122, 0.6)"; // zinc-500
		default:
			return canBeReserved
				? "rgba(217, 119, 6, 0.4)"
				: "rgba(113, 113, 122, 0.6)";
	}
}
