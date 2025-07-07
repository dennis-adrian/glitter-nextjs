import { infractions, infractionTypes } from "@/db/schema";

export type InfractionType = typeof infractionTypes.$inferSelect;

export type NewInfraction = typeof infractions.$inferInsert;
