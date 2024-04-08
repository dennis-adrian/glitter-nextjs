"use server";

import { StandBase } from "@/app/api/stands/actions";
import { ProfileWithParticipationsAndRequests } from "@/app/api/users/definitions";
import { TicketWithVisitor } from "@/app/data/tickets/actions";
import {
  festivals,
  standReservations,
  stands,
  tickets,
  userRequests,
  visitors,
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
export type FestivalMapVersion = FestivalBase["maps_version"];
