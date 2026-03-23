import { Stamp, Sticker, Trophy, Sparkles, BookOpen } from "lucide-react";

import { FestivalActivity } from "@/app/lib/festivals/definitions";

export const ACTIVITY_ICONS: Record<FestivalActivity["type"], typeof Stamp> = {
	stamp_passport: Stamp,
	sticker_print: Sticker,
	best_stand: Trophy,
	festival_sticker: Sparkles,
	coupon_book: BookOpen,
};

export const ACTIVITY_LABELS: Record<FestivalActivity["type"], string> = {
	stamp_passport: "Sello",
	sticker_print: "Sticker Print",
	best_stand: "Votación",
	festival_sticker: "Sticker del Festival",
	coupon_book: "Descuentos",
};
