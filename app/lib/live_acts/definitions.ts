import { InferInsertModel, InferSelectModel } from "drizzle-orm";

import { liveActs } from "@/db/schema";

export type LiveAct = InferSelectModel<typeof liveActs>;
export type NewLiveAct = InferInsertModel<typeof liveActs>;

/** Client-supplied fields allowed when creating a postulation (server sets status, notes, timestamps). */
export type CreateLiveActInput = Pick<
	NewLiveAct,
	| "actName"
	| "category"
	| "description"
	| "resourceLink"
	| "socialLinks"
	| "contactName"
	| "contactEmail"
	| "contactPhone"
>;
export type LiveActStatus = LiveAct["status"];
export type LiveActCategory = LiveAct["category"];
