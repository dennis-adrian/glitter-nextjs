"use server";

import { StandBase } from "@/app/api/stands/actions";
import {
  BaseProfile,
  ProfileWithParticipationsAndRequests,
} from "@/app/api/users/definitions";
import { TicketWithVisitor } from "@/app/data/tickets/actions";
import { FestivalSectorWithStands } from "@/app/lib/festival_sectors/definitions";
import {
  festivalActivities,
  festivalActivityDetails,
  festivalActivityParticipantProofs,
  festivalActivityParticipants,
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
  festivalSectors: FestivalSectorWithStands[];
};

export type FullFestival = Festival & {
  festivalActivities: (FestivalActivity & {
    details: ActivityDetailsWithParticipants[];
  })[];
};

export type FestivalActivityWithDetailsAndParticipants = FestivalActivity & {
  details: ActivityDetailsWithParticipants[];
};

export type ActivityDetailsWithParticipants = FestivalActivityDetail & {
  participants: (FestivalActivityParticipant & {
    user: BaseProfile;
    proofs: (typeof festivalActivityParticipantProofs.$inferSelect)[];
  })[];
};

export type FestivalActivity = typeof festivalActivities.$inferSelect;
export type FestivalActivityDetail =
  typeof festivalActivityDetails.$inferSelect;
export type FestivalActivityParticipant =
	typeof festivalActivityParticipants.$inferSelect;

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

export type FestivalWithSectors = FestivalBase & {
  festivalSectors: FestivalSectorWithStands[];
};
