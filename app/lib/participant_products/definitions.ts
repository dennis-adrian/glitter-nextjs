import { InferInsertModel } from "drizzle-orm";
import { participantProducts } from "@/db/schema";

export type NewParticipantProduct = InferInsertModel<
	typeof participantProducts
>;
