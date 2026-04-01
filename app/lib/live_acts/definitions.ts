import { InferInsertModel, InferSelectModel } from "drizzle-orm";

import { liveActs } from "@/db/schema";

export type LiveAct = InferSelectModel<typeof liveActs>;
export type NewLiveAct = InferInsertModel<typeof liveActs>;
export type LiveActStatus = LiveAct["status"];
export type LiveActCategory = LiveAct["category"];
