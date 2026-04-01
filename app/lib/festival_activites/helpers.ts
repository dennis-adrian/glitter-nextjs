import { FestivalActivity } from "@/app/lib/festivals/definitions";

export type MaterialConfig = {
	label: string;
	article: "el" | "la";
	pastParticiple: "aprobado" | "aprobada";
};

const MATERIAL_CONFIG: Record<FestivalActivity["type"], MaterialConfig> = {
	best_stand: { label: "foto del stand", article: "la", pastParticiple: "aprobada" },
	sticker_print: { label: "diseño del sticker", article: "el", pastParticiple: "aprobado" },
	stamp_passport: { label: "diseño del sello", article: "el", pastParticiple: "aprobado" },
	festival_sticker: { label: "diseño del sticker", article: "el", pastParticiple: "aprobado" },
	coupon_book: { label: "cupón", article: "el", pastParticiple: "aprobado" },
};

const FALLBACK: MaterialConfig = {
	label: "material",
	article: "el",
	pastParticiple: "aprobado",
};

export function getMaterialConfig(
	activityType: FestivalActivity["type"],
): MaterialConfig {
	return MATERIAL_CONFIG[activityType] ?? FALLBACK;
}
