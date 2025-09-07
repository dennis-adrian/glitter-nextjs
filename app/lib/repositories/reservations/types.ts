import { standReservations } from "@/db/schema";

export type NewStandReservation = typeof standReservations.$inferInsert & {
	participantIds: number[];
};
