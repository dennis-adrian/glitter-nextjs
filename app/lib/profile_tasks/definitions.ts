import { scheduledTasks } from "@/db/schema";
import { BaseProfile } from "@/app/api/users/definitions";

export type BaseProfileTask = typeof scheduledTasks.$inferSelect;
export type ProfileTaskWithProfile = BaseProfileTask & {
  profile: BaseProfile;
};
