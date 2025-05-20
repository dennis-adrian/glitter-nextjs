import { badges } from "@/db/schema";
import { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { FestivalBase } from "../festivals/definitions";

export type BadgeBase = InferSelectModel<typeof badges>;
export type NewBadge = InferInsertModel<typeof badges>;
export type BadgeWithFestival = BadgeBase & {
	festival: FestivalBase | null;
};
