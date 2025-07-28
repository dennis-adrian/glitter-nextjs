import { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { participantProducts } from "@/db/schema";

export type ParticipantProduct = InferSelectModel<typeof participantProducts>;
export type NewParticipantProduct = InferInsertModel<
	typeof participantProducts
>;
