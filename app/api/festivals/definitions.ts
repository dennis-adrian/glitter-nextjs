"use server";

import { StandBase } from "@/app/api/stands/actions";
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
  stands: StandBase[];
};

export type FestivalWithUserRequests = Omit<
  Festival,
  "standReservations" | "stands"
>;
