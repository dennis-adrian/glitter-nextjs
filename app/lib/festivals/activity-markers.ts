import {
  BookOpenIcon,
  SearchIcon,
  SparklesIcon,
  StampIcon,
  type LucideIcon,
} from "lucide-react";

import type { FestivalActivity } from "@/app/lib/festivals/definitions";

export type ActivityMarker = {
  /** Name used where the activity is the subject, e.g. its card. */
  label: string;
  /** Name used where the marker is the subject, e.g. the map legend. */
  legendLabel: string;
  symbol: string;
  Icon: LucideIcon;
  /** Tinted treatment for chips and tiles alongside body copy. */
  softClassName: string;
  /** Solid treatment for the legend swatch, matching the painted badge. */
  swatchClassName: string;
  /** Badge fill in the SVG map, where Tailwind classes do not reach. */
  badgeFill: string;
  /** Sentence used on a participant's stand, where the article matters. */
  participationLabel: string;
};

/**
 * One place where an activity type becomes a label, a glyph, a color and an
 * icon, so the map badges, the legend and the activities list all name the same
 * thing the same way. Types absent here carry no map marker.
 */
export function getActivityMarker(
  type: FestivalActivity["type"],
): ActivityMarker {
  if (type === "coupon_book") {
    return {
      label: "Cuponera",
      legendLabel: "En cuponera",
      symbol: "%",
      Icon: BookOpenIcon,
      softClassName: "border-amber-200 bg-amber-50 text-amber-800",
      swatchClassName: "border-amber-700 bg-amber-600",
      badgeFill: "#F59E0B",
      participationLabel: "Participa en la cuponera",
    };
  }

  if (type === "stamp_passport") {
    return {
      label: "Carrera de sellos",
      legendLabel: "Carrera de sellos",
      symbol: "★",
      Icon: StampIcon,
      softClassName: "border-emerald-200 bg-emerald-50 text-emerald-800",
      swatchClassName: "border-emerald-800 bg-emerald-600",
      badgeFill: "#059669",
      participationLabel: "Participa en la carrera de sellos",
    };
  }

  if (type === "sticker_hunt") {
    return {
      label: "Cacería de stickers",
      legendLabel: "Cacería de stickers",
      symbol: "♦",
      Icon: SearchIcon,
      softClassName: "border-pink-200 bg-pink-50 text-pink-800",
      swatchClassName: "border-pink-800 bg-pink-600",
      badgeFill: "#DB2777",
      participationLabel: "Participa en la cacería de stickers",
    };
  }

  if (type === "festival_sticker") {
    return {
      label: "Sticker del festival",
      legendLabel: "Sticker del festival",
      symbol: "✦",
      Icon: SparklesIcon,
      softClassName: "border-sky-200 bg-sky-50 text-sky-800",
      swatchClassName: "border-sky-800 bg-sky-600",
      badgeFill: "#0284C7",
      participationLabel: "Participa en el sticker del festival",
    };
  }

  return {
    label: "Actividad del festival",
    legendLabel: "Actividad del festival",
    symbol: "•",
    Icon: SparklesIcon,
    softClassName: "border-primary-200 bg-primary-50 text-primary-800",
    swatchClassName: "border-primary-700 bg-primary-600",
    badgeFill: "hsl(262, 77%, 49%)",
    participationLabel: "Participa en esta actividad",
  };
}
