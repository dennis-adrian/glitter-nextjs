import { StandBase } from "@/app/api/stands/definitions";
import { standReservations } from "@/db/schema";

export type ReservationBase = typeof standReservations.$inferSelect;
export type ReservationWithStand = ReservationBase & {
  stand: StandBase;
};
