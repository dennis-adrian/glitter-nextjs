import { scheduledTasks } from "@/db/schema";
import { BaseProfile } from "@/app/api/users/definitions";
import { ReservationWithStand } from "@/app/api/reservations/definitions";
import { FestivalBase } from "../festivals/definitions";

export type BaseScheduledTask = typeof scheduledTasks.$inferSelect;
export type ScheduledTaskWithProfile = BaseScheduledTask & {
  profile: BaseProfile;
};
export type ScheduledTaskWithProfileAndReservation =
  ScheduledTaskWithProfile & {
    reservation: ReservationWithStand & {
      festival: FestivalBase;
    };
  };
