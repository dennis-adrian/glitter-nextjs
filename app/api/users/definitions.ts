import {
  users,
  userRequests,
  userSocials,
  reservationParticipants,
  standReservations,
} from "@/db/schema";

export type UserSocial = typeof userSocials.$inferSelect;
type UserRequest = typeof userRequests.$inferSelect;
type Participation = typeof reservationParticipants.$inferSelect & {
  reservation: typeof standReservations.$inferSelect;
};
export type ProfileType = typeof users.$inferSelect & {
  userSocials: UserSocial[];
  userRequests: UserRequest[];
  participations: Participation[];
};
export type ProfileWithParticipationsAndRequests = typeof users.$inferSelect & {
  participations: Participation[];
  userRequests: (typeof userRequests.$inferSelect)[];
};

export type NewUserSocial = typeof userSocials.$inferInsert;
