import { usersToSocials, users, socials, userRequests } from '@/db/schema';

type Social = typeof socials.$inferSelect;
type UserSocial = typeof usersToSocials.$inferSelect & { social: Social };
type UserRequest = typeof userRequests.$inferSelect;
export type ProfileType = typeof users.$inferSelect & {
  socials: UserSocial[];
  userRequests: UserRequest[];
};
