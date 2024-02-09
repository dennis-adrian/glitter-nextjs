"use server";

import { ProfileWithParticipationsAndRequests } from "@/app/api/users/definitions";
import {
  festivals,
  standReservations,
  stands,
  userRequests,
} from "@/db/schema";

export type FestivalBase = typeof festivals.$inferSelect;
type UserRequest = typeof userRequests.$inferSelect & {
  user: ProfileWithParticipationsAndRequests;
};
export type Festival = FestivalBase & {
  userRequests: UserRequest[];
  standReservations: (typeof standReservations.$inferSelect)[];
  stands: (typeof stands.$inferSelect)[];
};

export type FestivalWithUserRequests = Omit<
  Festival,
  "standReservations" | "stands"
>;
