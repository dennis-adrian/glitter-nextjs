import { userCategoryEnum, userStatusEnum } from "@/db/schema";
import { z } from "zod";
import {
  DEFAULT_PARTICIPANT_VISIBLE_STATUSES,
  DEFAULT_PROFILE_REQUEST_STATUSES,
} from "@/app/lib/participants/definitions";

const statusSchema = z
  .union([
    z.enum(userStatusEnum.enumValues),
    z.array(z.enum(userStatusEnum.enumValues)),
  ])
  .optional()
  .transform((value) => {
    if (typeof value === "string") return [value];
    return value;
  });

const categorySchema = z
  .union([
    z.enum(userCategoryEnum.enumValues),
    z.array(z.enum(userCategoryEnum.enumValues)),
  ])
  .optional()
  .transform((value) => {
    if (typeof value === "string") return [value];
    return value;
  });

const sortSchema = z
  .enum([
    "displayName",
    "category",
    "status",
    "verifiedAt",
    "updatedAt",
    "createdAt",
    "lastParticipationAt",
    "lastTermsAcceptedAt",
  ])
  .prefault("updatedAt");

const baseSearchParamsSchema = z.object({
  limit: z.coerce.number().optional(),
  offset: z.coerce.number().optional(),
  includeAdmins: z
    .string()
    .toLowerCase()
    .transform((x) => x === "true")
    .pipe(z.boolean())
    .optional(),
  category: categorySchema,
  query: z.string().trim().prefault(""),
  sort: sortSchema,
  direction: z.enum(["asc", "desc"]).prefault("desc"),
  profileCompletion: z.enum(["complete", "incomplete", "all"]).prefault("all"),
});

export const SearchParamsSchema = baseSearchParamsSchema.extend({
  status: statusSchema,
});

export const ParticipantSearchParamsSchema = baseSearchParamsSchema.extend({
  status: statusSchema.transform((value) => {
    if (!value?.length) return [...DEFAULT_PARTICIPANT_VISIBLE_STATUSES];
    return value;
  }),
  pauseEligible: z
    .string()
    .toLowerCase()
    .transform((value) => value === "true")
    .pipe(z.boolean())
    .optional(),
});

export const ProfileRequestSearchParamsSchema = baseSearchParamsSchema.extend({
  status: statusSchema.transform((value) => {
    if (!value?.length) return [...DEFAULT_PROFILE_REQUEST_STATUSES];
    return value;
  }),
});

export type SearchParamsSchemaType = z.infer<typeof SearchParamsSchema>;
export type ParticipantSearchParamsSchemaType = z.infer<
  typeof ParticipantSearchParamsSchema
>;
export type ProfileRequestSearchParamsSchemaType = z.infer<
  typeof ProfileRequestSearchParamsSchema
>;
