import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { MapElementBase } from "@/app/lib/map_elements/definitions";
import { MapCanvasConfig } from "./map-types";

// Default canvas config
export const DEFAULT_CANVAS_CONFIG: MapCanvasConfig = {
	minX: 0,
	minY: 0,
	width: 100,
	height: 100,
	backgroundColor: "#ffffff",
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
	mapElements?: MapElementBase[],
): { minX: number; minY: number; width: number; height: number } {
	const positioned = stands.filter(
		(s) => s.positionLeft != null && s.positionTop != null,
	);

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

	for (const el of mapElements ?? []) {
		const left = el.positionLeft;
		const top = el.positionTop;
		const right = left + el.width;
		const bottom = top + el.height;
		minLeft = Math.min(minLeft, left);
		minTop = Math.min(minTop, top);
		maxRight = Math.max(maxRight, right);
		maxBottom = Math.max(maxBottom, bottom);
	}

	if (minLeft === Infinity) {
		return { minX: 0, minY: 0, width: 50, height: 50 };
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
			return "rgba(91, 33, 182, 0.85)"; // violet-800 — seleccionado
		case "confirmed":
			return "rgba(209, 213, 219, 0.5)"; // gray-300 — ocupado
		case "disabled":
			return "rgba(229, 231, 235, 0.35)"; // gray-200 — no disponible
		default:
			return canBeReserved
				? "rgba(221, 214, 254, 0.6)" // violet-200 — disponible
				: "rgba(229, 231, 235, 0.35)"; // gray-200 — no disponible
	}
}

export function getStandHoverFillColor(
	status: string,
	canBeReserved: boolean,
): string {
	switch (status) {
		case "reserved":
			return "rgba(91, 33, 182, 0.95)"; // violet-800 darker
		case "confirmed":
			return "rgba(209, 213, 219, 0.65)"; // gray-300
		case "disabled":
			return "rgba(229, 231, 235, 0.45)"; // gray-200
		default:
			return canBeReserved
				? "rgba(196, 181, 253, 0.7)" // violet-300 — disponible hover
				: "rgba(229, 231, 235, 0.45)";
	}
}

export function getStandStrokeColor(
	status: string,
	canBeReserved: boolean,
): string {
	switch (status) {
		case "reserved":
			return "rgba(91, 33, 182, 1)"; // violet-800
		case "confirmed":
			return "rgba(156, 163, 175, 0.6)"; // gray-400
		case "disabled":
			return "rgba(209, 213, 219, 0.4)"; // gray-300
		default:
			return canBeReserved
				? "rgba(139, 92, 246, 0.6)" // violet-500 — disponible
				: "rgba(209, 213, 219, 0.4)"; // gray-300
	}
}

export function getStandTextColor(
	status: string,
	canBeReserved: boolean,
): string {
	switch (status) {
		case "reserved":
			return "#ffffff"; // white on dark purple
		case "confirmed":
			return "#6B7280"; // gray-500
		case "disabled":
			return "#9CA3AF"; // gray-400
		default:
			return canBeReserved ? "#374151" : "#9CA3AF"; // gray-700 or gray-400
	}
}
