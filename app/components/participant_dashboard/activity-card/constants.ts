import { Stamp, Sticker, Trophy, Sparkles } from "lucide-react";

import { FestivalActivity } from "@/app/lib/festivals/definitions";

export const ACTIVITY_ICONS: Record<FestivalActivity["type"], typeof Stamp> = {
	stamp_passport: Stamp,
	sticker_print: Sticker,
	best_stand: Trophy,
	festival_sticker: Sparkles,
};

export const ACTIVITY_LABELS: Record<FestivalActivity["type"], string> = {
	stamp_passport: "Sello",
	sticker_print: "Sticker Print",
	best_stand: "Voting",
	festival_sticker: "Sticker del Festival",
};
