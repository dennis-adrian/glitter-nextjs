import {
  users,
  userRequests,
  userSocials,
  reservationParticipants,
  standReservations,
  scheduledTasks,
  tags,
  profileTags,
} from "@/db/schema";

export type UserSocial = typeof userSocials.$inferSelect;
type UserRequest = typeof userRequests.$inferSelect;
type Participation = typeof reservationParticipants.$inferSelect & {
  reservation: typeof standReservations.$inferSelect;
};

export type BaseProfile = typeof users.$inferSelect;
export type ProfileWithSocials = BaseProfile & {
  userSocials: UserSocial[];
};
export type Tag = typeof tags.$inferSelect;
export type ProfileTag = typeof profileTags.$inferSelect;
export type ProfileTagWithTag = typeof profileTags.$inferSelect & {
  tag: Tag;
};

export type ProfileType = BaseProfile & {
  userSocials: UserSocial[];
  userRequests: UserRequest[];
  participations: Participation[];
  profileTags: ProfileTagWithTag[];
};
export type ProfileWithParticipationsAndRequests = typeof users.$inferSelect & {
  participations: Participation[];
  userRequests: (typeof userRequests.$inferSelect)[];
};

export type NewUserSocial = typeof userSocials.$inferInsert;
export type NewProfileTask = typeof scheduledTasks.$inferInsert;
export type UserCategory = BaseProfile["category"];
