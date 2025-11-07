import { infractions, infractionTypes, sanctions } from "@/db/schema";

export type InfractionType = typeof infractionTypes.$inferSelect;

export type NewInfraction = typeof infractions.$inferInsert;

export type InfractionBase = typeof infractions.$inferSelect;

export type SanctionBase = typeof sanctions.$inferSelect;
