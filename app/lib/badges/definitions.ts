import { badges } from "@/db/schema";
import { InferInsertModel, InferSelectModel } from "drizzle-orm";

export type BadgeBase = InferSelectModel<typeof badges>;
export type NewBadge = InferInsertModel<typeof badges>;
