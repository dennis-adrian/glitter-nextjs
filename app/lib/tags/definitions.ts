import { tags } from "@/db/schema";

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
