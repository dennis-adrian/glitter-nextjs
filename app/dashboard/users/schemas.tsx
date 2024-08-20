import { BaseProfile } from "@/app/api/users/definitions";
import { userCategoryEnum, userStatusEnum } from "@/db/schema";
import { z } from "zod";

export const SearchParamsSchema = z.object({
  limit: z.coerce.number().optional(),
  offset: z.coerce.number().optional(),
  includeAdmins: z
    .string()
    .toLowerCase()
    .transform((x) => x === "true")
    .pipe(z.boolean())
    .optional(),
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
  category: z
    .union([
      z.enum(userCategoryEnum.enumValues),
      z.array(z.enum(userCategoryEnum.enumValues)),
    ])
    .optional()
    .transform((value) => {
      if (typeof value === "string") return [value];
      return value;
    }),
  query: z.string().trim().default(""),
  sort: z
    .enum([
      "displayName",
      "category",
      "status",
      "verifiedAt",
      "updatedAt",
      "createdAt",
    ])
    .default("updatedAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});

export type SearchParamsSchemaType = z.infer<typeof SearchParamsSchema>;
