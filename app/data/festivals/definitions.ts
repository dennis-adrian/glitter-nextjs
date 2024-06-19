"use server";

import { StandBase } from "@/app/api/stands/actions";
import { ProfileWithParticipationsAndRequests } from "@/app/api/users/definitions";
import { TicketWithVisitor } from "@/app/data/tickets/actions";
import {
  festivalDates,
  festivals,
  festivalSectors,
  standReservations,
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

export type FestivalWithTickets = FestivalBase & {
  tickets: TicketWithVisitor[];
};
export type FestivalMapVersion = FestivalBase["mapsVersion"];
export type FestivalWithDatesAndSectors = FestivalBase & {
  festivalDates: (typeof festivalDates.$inferSelect)[];
  festivalSectors: (typeof festivalSectors.$inferSelect)[];
};
export type FestivalDate = typeof festivalDates.$inferSelect;
