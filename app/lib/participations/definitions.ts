import { InferSelectModel } from "drizzle-orm";
import { reservationParticipants, standReservations, users } from "@/db/schema";

export type ReservationParticipant = InferSelectModel<
	typeof reservationParticipants
>;
