import { profileTasks } from "@/db/schema";
import { BaseProfile } from "@/app/api/users/definitions";

export type BaseProfileTask = typeof profileTasks.$inferSelect;
export type ProfileTaskWithProfile = BaseProfileTask & {
  profile: BaseProfile;
};
