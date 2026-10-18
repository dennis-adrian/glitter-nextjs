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

/**
 * A map colour that the dark theme can override. The literal is the light
 * value and is used as-is unless `.dark` in globals.css defines
 * `--map-<name>`, so these palettes stay tuned for the white map sheet while
 * the dark sheet gets its own. Works in SVG presentation attributes as well
 * as inline styles.
 */
export function mapColor(name: string, light: string): string {
  return `var(--map-${name}, ${light})`;
}

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
  mapElements?: Array<
    Pick<MapElementBase, "positionLeft" | "positionTop" | "width" | "height">
  >,
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
      return mapColor("held-fill", "rgba(251, 191, 36, 0.6)"); // amber-400 — en espera
    case "reserved":
      return "rgba(91, 33, 182, 0.85)"; // violet-800 — seleccionado
    case "confirmed":
      return mapColor("taken-fill", "rgba(209, 213, 219, 0.5)"); // gray-300 — ocupado
    case "disabled":
      return mapColor("unavailable-fill", "rgba(229, 231, 235, 0.35)"); // gray-200 — no disponible
    default:
      return canBeReserved
        ? mapColor("available-fill", "rgba(221, 214, 254, 0.6)") // violet-200 — disponible
        : mapColor("unavailable-fill", "rgba(229, 231, 235, 0.35)"); // gray-200 — no disponible
  }
}

export function getStandHoverFillColor(
  status: string,
  canBeReserved: boolean,
): string {
  switch (status) {
    case "held":
      return mapColor("held-hover", "rgba(245, 158, 11, 0.7)"); // amber-500 — en espera hover
    case "reserved":
      return "rgba(91, 33, 182, 0.95)"; // violet-800 darker
    case "confirmed":
      return mapColor("taken-hover", "rgba(209, 213, 219, 0.65)"); // gray-300
    case "disabled":
      return mapColor("unavailable-hover", "rgba(229, 231, 235, 0.45)"); // gray-200
    default:
      return canBeReserved
        ? mapColor("available-hover", "rgba(196, 181, 253, 0.7)") // violet-300 — disponible hover
        : mapColor("unavailable-hover", "rgba(229, 231, 235, 0.45)");
  }
}

export function getStandStrokeColor(
  status: string,
  canBeReserved: boolean,
): string {
  switch (status) {
    case "held":
      return mapColor("held-stroke", "rgba(217, 119, 6, 0.8)"); // amber-600 — en espera
    case "reserved":
      return "rgba(91, 33, 182, 1)"; // violet-800
    case "confirmed":
      return mapColor("taken-stroke", "rgba(156, 163, 175, 0.6)"); // gray-400
    case "disabled":
      return mapColor("unavailable-stroke", "rgba(209, 213, 219, 0.4)"); // gray-300
    default:
      return canBeReserved
        ? mapColor("available-stroke", "rgba(139, 92, 246, 0.8)") // violet-500 — disponible
        : mapColor("unavailable-stroke", "rgba(209, 213, 219, 0.4)"); // gray-300
  }
}

export function getStandTextColor(
  status: string,
  canBeReserved: boolean,
): string {
  switch (status) {
    case "held":
      return mapColor("held-text", "#92400E"); // amber-800 — en espera
    case "reserved":
      return "#ffffff"; // white on dark purple
    case "confirmed":
      return mapColor("taken-text", "#6B7280"); // gray-500
    case "disabled":
      return mapColor("unavailable-text", "#9CA3AF"); // gray-400
    default:
      return canBeReserved
        ? mapColor("available-text", "hsl(262, 77%, 49%)") // primary — purple text
        : mapColor("unavailable-text", "#9CA3AF"); // gray-400
  }
}

// Selected stand colors (reservation map)
export const SELECTED_FILL = "hsl(262, 77%, 49%)"; // primary
export const SELECTED_STROKE = "#ffffff"; // white border
export const SELECTED_TEXT = "#ffffff"; // white text
export const SELECTED_RING = "hsl(262, 76%, 90%)"; // primary-100

/**
 * Stands filtered out of the current view. Neutral grey on purpose: dimming the
 * occupied purple by opacity alone lands it on the "disponible" violet, which
 * would turn a filtered-out stand into an empty one. Grey carries no meaning in
 * the public legend, so it can only read as "not part of this filter".
 */
export const DIMMED_COLORS: StandColors = {
  fill: mapColor("dimmed-fill", "rgba(229, 231, 235, 0.55)"), // gray-200
  hoverFill: mapColor("dimmed-hover", "rgba(209, 213, 219, 0.7)"), // gray-300
  stroke: mapColor("dimmed-stroke", "rgba(156, 163, 175, 0.7)"), // gray-400
  text: mapColor("dimmed-text", "#9CA3AF"), // gray-400
};

/** Kept high: the filtered-out stands still have to work as a venue layout. */
export const DIMMED_OPACITY = 0.9;

export function getAdminOverviewColors(
  standStatus: string,
  reservationStatus?: string | null,
  isOverdue?: boolean,
  isExternalParticipant?: boolean,
): StandColors {
  if (standStatus === "disabled") {
    return {
      fill: mapColor("unavailable-fill", "rgba(229, 231, 235, 0.35)"),
      hoverFill: mapColor("unavailable-hover", "rgba(229, 231, 235, 0.5)"),
      stroke: mapColor("unavailable-stroke", "rgba(209, 213, 219, 0.4)"),
      text: mapColor("unavailable-text", "#9CA3AF"),
    };
  }
  if (standStatus === "available") {
    return {
      fill: mapColor("open-fill", "rgba(255, 255, 255, 0.9)"),
      hoverFill: mapColor("open-hover", "rgba(249, 250, 251, 1)"),
      stroke: mapColor("open-stroke", "rgba(209, 213, 219, 0.6)"),
      text: mapColor("open-text", "#6B7280"),
    };
  }
  if (standStatus === "held") {
    return {
      fill: mapColor("held-fill", "rgba(251, 191, 36, 0.6)"),
      hoverFill: mapColor("held-hover", "rgba(245, 158, 11, 0.7)"),
      stroke: mapColor("held-stroke", "rgba(217, 119, 6, 0.8)"),
      text: mapColor("held-text", "#92400E"),
    };
  }
  if (isExternalParticipant) return getExternalParticipantStandColors();
  // For all other stand states, color is driven by reservation status
  if (reservationStatus === "verification_payment") {
    return {
      fill: mapColor("verifying-fill", "rgba(96, 165, 250, 0.7)"),
      hoverFill: mapColor("verifying-hover", "rgba(59, 130, 246, 0.8)"),
      stroke: mapColor("verifying-stroke", "rgba(37, 99, 235, 0.9)"),
      text: mapColor("verifying-text", "#1E3A8A"),
    };
  }
  if (reservationStatus === "accepted") {
    return {
      fill: "hsl(262, 77%, 49%)",
      hoverFill: "hsl(262, 77%, 44%)",
      stroke: "hsl(262, 77%, 35%)",
      text: "#ffffff",
    };
  }
  if (isOverdue) {
    return {
      fill: mapColor("overdue-fill", "rgba(252, 165, 165, 0.7)"),
      hoverFill: mapColor("overdue-hover", "rgba(248, 113, 113, 0.8)"),
      stroke: mapColor("overdue-stroke", "rgba(220, 38, 38, 0.9)"),
      text: mapColor("overdue-text", "#7F1D1D"),
    };
  }
  if (reservationStatus === "pending") {
    return {
      fill: mapColor("pending-fill", "rgba(134, 239, 172, 0.7)"),
      hoverFill: mapColor("pending-hover", "rgba(74, 222, 128, 0.8)"),
      stroke: mapColor("pending-stroke", "rgba(34, 197, 94, 0.9)"),
      text: mapColor("pending-text", "#14532D"),
    };
  }
  // Fallback: no reservation found
  return {
    fill: mapColor("open-fill", "rgba(255, 255, 255, 0.9)"),
    hoverFill: mapColor("open-hover", "rgba(249, 250, 251, 1)"),
    stroke: mapColor("open-stroke", "rgba(209, 213, 219, 0.6)"),
    text: mapColor("open-text", "#6B7280"),
  };
}

export function getPublicStandColors(status: string): StandColors {
  if (status === "available") {
    return {
      fill: mapColor("available-fill", "rgba(221, 214, 254, 0.6)"), // violet-200 — disponible
      hoverFill: mapColor("available-hover", "rgba(196, 181, 253, 0.7)"), // violet-300
      stroke: mapColor("available-stroke", "rgba(139, 92, 246, 0.6)"), // violet-500
      text: mapColor("available-text", "hsl(262, 77%, 49%)"), // primary purple
    };
  }
  if (status === "held") {
    return {
      fill: mapColor("held-fill", "rgba(251, 191, 36, 0.6)"), // amber-400 — en espera
      hoverFill: mapColor("held-hover", "rgba(245, 158, 11, 0.7)"), // amber-500
      stroke: mapColor("held-stroke", "rgba(217, 119, 6, 0.8)"), // amber-600
      text: mapColor("held-text", "#92400E"), // amber-800
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

export function getExternalParticipantStandColors(): StandColors {
  return {
    fill: "rgba(13, 148, 136, 0.82)",
    hoverFill: "rgba(15, 118, 110, 0.92)",
    stroke: "rgba(17, 94, 89, 0.9)",
    text: "#ffffff",
  };
}
