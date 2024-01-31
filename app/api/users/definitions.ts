import { users, userRequests, userSocials } from "@/db/schema";

type UserSocial = typeof userSocials.$inferSelect;
type UserRequest = typeof userRequests.$inferSelect;
export type ProfileType = typeof users.$inferSelect & {
  userSocials: UserSocial[];
  userRequests: UserRequest[];
};

export type NewUserSocial = typeof userSocials.$inferInsert;
