import type {
  BaseProfile,
  ProfileWithParticipationsAndRequests,
} from "@/app/api/users/definitions";
import type { TicketWithVisitor } from "@/app/data/tickets/actions";
import type { FestivalSectorWithStands } from "@/app/lib/festival_sectors/definitions";
import {
  festivalActivities,
  festivalActivityDetails,
  festivalActivityParticipantProofs,
  festivalActivityParticipants,
  festivalActivityVotes,
  festivalActivityWaitlist,
  festivalDates,
  festivals,
  festivalSectors,
  standReservations,
  userRequests,
} from "@/db/schema";

export type FestivalBase = typeof festivals.$inferSelect;

/**
 * A verified profile a festival's sectors can take, as the staff invitation
 * screens list it: who they are, where the invitation goes, and the category
 * that sorts them into a mailing. Never their phone, birthdate or account ids.
 */
export type FestivalAvailableUser = Pick<
  BaseProfile,
  "id" | "displayName" | "email" | "category"
>;
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
  festivalActivities: FestivalActivityWithDetailsAndParticipants[];
};

export type WaitlistEntry = typeof festivalActivityWaitlist.$inferSelect;

/**
 * The profile fields an activity's participant and waitlist rows carry. An
 * activity reaches client components on pages any signed-in user can open, so
 * it never carries contact or identity data. Staff screens add the real name.
 */
export type ActivityProfile = Pick<
  BaseProfile,
  "id" | "displayName" | "imageUrl" | "category" | "status"
> &
  Partial<Pick<BaseProfile, "firstName" | "lastName">>;

export type WaitlistEntryWithUser = WaitlistEntry & {
  user: ActivityProfile;
  status?: "waiting" | "invited" | "expired";
  serverStatus?: "waiting" | "invited" | "expired";
};

export type FestivalActivityWithDetailsAndParticipants = FestivalActivity & {
  details: ActivityDetailsWithParticipants[];
  waitlistEntries: WaitlistEntryWithUser[];
};

export type ParticipantWithUserAndProofs = FestivalActivityParticipant & {
  user: ActivityProfile;
  proofs: (typeof festivalActivityParticipantProofs.$inferSelect)[];
};

export type ActivityVariantVote = typeof festivalActivityVotes.$inferSelect;

export type ActivityDetailsWithParticipants = FestivalActivityDetail & {
  participants: ParticipantWithUserAndProofs[];
  votes: ActivityVariantVote[];
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

export type PublicFestivalPage = FestivalWithDates & {
  festivalActivities: FestivalActivity[];
};

export type FestivalWithSectors = FestivalBase & {
  festivalSectors: FestivalSectorWithStands[];
};

export type FestivalWithDatesAndSectors = FestivalBase & {
  festivalDates: FestivalDate[];
  festivalSectors: FestivalSectorWithStands[];
};
export type FestivalSector = typeof festivalSectors.$inferSelect;

export type RecentSharedStandPartner = BaseProfile & {
  isEligible: boolean;
  isReserved: boolean;
  isSelectable: boolean;
};
