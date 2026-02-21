import { ReservationWithParticipantsAndUsers } from "@/app/api/reservations/definitions";
import { standSubcategories, stands, subcategories } from "@/db/schema";

export type StandPosition = {
	id: number;
	left: number;
	top: number;
};

export type ElementSize = {
	wide: number;
	narrow: number;
};

export type StandBase = typeof stands.$inferSelect;
export type StandZone = StandBase["zone"];

export type StandSubcategory = typeof standSubcategories.$inferSelect & {
	subcategory: typeof subcategories.$inferSelect;
};

export type StandWithReservationsWithParticipants = StandBase & {
	reservations: ReservationWithParticipantsAndUsers[];
	standSubcategories: StandSubcategory[];
};
