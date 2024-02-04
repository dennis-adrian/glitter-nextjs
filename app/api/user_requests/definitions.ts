import { z } from "zod";
import { requestStatusEnum, userRequests, users } from "@/db/schema";

export const RequestStatusEnum = z.enum(requestStatusEnum.enumValues).Enum;
export type UserRequest = typeof userRequests.$inferSelect & {
  user: typeof users.$inferSelect;
  festival: typeof festivals.$inferSelect | null;
};
