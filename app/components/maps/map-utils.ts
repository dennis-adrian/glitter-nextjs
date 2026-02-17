import { MapElementBase } from "@/app/lib/map_elements/definitions";
import { MapCanvasConfig } from "./map-types";

/** Minimal stand shape needed to compute canvas bounds from positions */
export type StandWithPosition = {
	positionLeft: number | null;
	positionTop: number | null;
};

export type StandColors = {
	fill: string;
	hoverFill: string;
	stroke: string;
	text: string;
};

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

export function getStandPosition(stand: StandWithPosition) {
	return {
		left: stand.positionLeft ?? 0,
		top: stand.positionTop ?? 0,
	};
}

export function computeCanvasBounds(
	stands: StandWithPosition[],
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
		case "held":
			return "rgba(251, 191, 36, 0.6)"; // amber-400 — en espera
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
		case "held":
			return "rgba(245, 158, 11, 0.7)"; // amber-500 — en espera hover
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
		case "held":
			return "rgba(217, 119, 6, 0.8)"; // amber-600 — en espera
		case "reserved":
			return "rgba(91, 33, 182, 1)"; // violet-800
		case "confirmed":
			return "rgba(156, 163, 175, 0.6)"; // gray-400
		case "disabled":
			return "rgba(209, 213, 219, 0.4)"; // gray-300
		default:
			return canBeReserved
				? "rgba(139, 92, 246, 0.8)" // violet-500 — disponible
				: "rgba(209, 213, 219, 0.4)"; // gray-300
	}
}

export function getStandTextColor(
	status: string,
	canBeReserved: boolean,
): string {
	switch (status) {
		case "held":
			return "#92400E"; // amber-800 — en espera
		case "reserved":
			return "#ffffff"; // white on dark purple
		case "confirmed":
			return "#6B7280"; // gray-500
		case "disabled":
			return "#9CA3AF"; // gray-400
		default:
			return canBeReserved
				? "hsl(262, 77%, 49%)" // primary — purple text
				: "#9CA3AF"; // gray-400
	}
}

// Selected stand colors (reservation map)
export const SELECTED_FILL = "hsl(262, 77%, 49%)"; // primary
export const SELECTED_STROKE = "#ffffff"; // white border
export const SELECTED_TEXT = "#ffffff"; // white text
export const SELECTED_RING = "hsl(262, 76%, 90%)"; // primary-100

export function getPublicStandColors(status: string): StandColors {
	if (status === "available") {
		return {
			fill: "rgba(221, 214, 254, 0.6)", // violet-200 — disponible
			hoverFill: "rgba(196, 181, 253, 0.7)", // violet-300
			stroke: "rgba(139, 92, 246, 0.6)", // violet-500
			text: "hsl(262, 77%, 49%)", // primary purple
		};
	}
	if (status === "held") {
		return {
			fill: "rgba(251, 191, 36, 0.6)", // amber-400 — en espera
			hoverFill: "rgba(245, 158, 11, 0.7)", // amber-500
			stroke: "rgba(217, 119, 6, 0.8)", // amber-600
			text: "#92400E", // amber-800
		};
	}
	// reserved | confirmed → occupied (deep violet + white text)
	return {
		fill: "rgba(109, 40, 217, 0.85)", // violet-700 — ocupado
		hoverFill: "rgba(109, 40, 217, 0.95)", // violet-700 hover
		stroke: "rgba(91, 33, 182, 0.8)", // violet-800
		text: "#ffffff", // white
	};
}
