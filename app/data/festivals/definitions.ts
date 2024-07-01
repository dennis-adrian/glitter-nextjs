"use server";

import { StandBase } from "@/app/api/stands/actions";
import { ProfileWithParticipationsAndRequests } from "@/app/api/users/definitions";
import { TicketWithVisitor } from "@/app/data/tickets/actions";
import {
  festivalDates,
  festivals,
  standReservations,
  userRequests,
} from "@/db/schema";

export type FestivalBase = typeof festivals.$inferSelect;
type UserRequest = typeof userRequests.$inferSelect & {
  user: ProfileWithParticipationsAndRequests;
};
export type Festival = FestivalBase & {
  festivalDates: FestivalDate[];
  userRequests: UserRequest[];
  standReservations: (typeof standReservations.$inferSelect)[];
  stands: StandBase[];
};

export type FestivalWithUserRequests = Omit<
  Festival,
  "standReservations" | "stands"
>;

export type FestivalWithTicketsAndDates = FestivalBase & {
  festivalDates: FestivalDate[];
  tickets: TicketWithVisitor[];
};
export type FestivalMapVersion = FestivalBase["mapsVersion"];

export type FestivalDate = typeof festivalDates.$inferSelect;
export type FestivalWithDates = FestivalBase & {
  festivalDates: FestivalDate[];
};
