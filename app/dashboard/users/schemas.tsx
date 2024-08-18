import { userStatusEnum } from "@/db/schema";
import { z } from "zod";

export const SearchParamsSchema = z.object({
  limit: z.coerce.number().default(10),
  offset: z.coerce.number().default(0),
  includeAdmins: z.coerce.boolean().default(false),
  status: z
    .union([
      z.enum(userStatusEnum.enumValues),
      z.array(z.enum(userStatusEnum.enumValues)),
    ])
    .optional()
    .transform((value) => {
      if (typeof value === "string") return [value];
      return value;
    }),
});

export type SearchParamsSchemaType = z.infer<typeof SearchParamsSchema>;
