import { FestivalBase } from "@/app/lib/festivals/definitions";
import { infractions, infractionTypes } from "@/db/schema";

export type InfractionType = typeof infractionTypes.$inferSelect;

export type NewInfraction = typeof infractions.$inferInsert;

export type InfractionBase = typeof infractions.$inferSelect;

export type InfractionWithTypeAndFestival = InfractionBase & {
	type: InfractionType;
	festival?: FestivalBase | null;
};
