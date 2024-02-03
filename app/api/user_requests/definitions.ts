import { z } from "zod";
import { requestStatusEnum } from "@/db/schema";

export const RequestStatusEnum = z.enum(requestStatusEnum.enumValues).Enum;
