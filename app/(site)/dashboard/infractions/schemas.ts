import { z } from "zod";

import {
  ALLOWED_INFRACTION_PAGE_SIZES,
  DEFAULT_INFRACTION_PAGE_SIZE,
} from "@/app/lib/infractions/constants";
import {
  festivalTypeEnum,
  infractionSeverityEnum,
  infractionStatusEnum,
} from "@/db/schema";

const pageSizeSchema = z.coerce
  .number()
  .int()
  .refine(
    (value): value is (typeof ALLOWED_INFRACTION_PAGE_SIZES)[number] =>
      (ALLOWED_INFRACTION_PAGE_SIZES as readonly number[]).includes(value),
    { message: "Tamaño de página inválido" },
  )
  .prefault(DEFAULT_INFRACTION_PAGE_SIZE);

const optionalPositiveInt = z.coerce.number().int().positive().optional();

const optionalBoolean = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();

const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "Fecha inválida")
  .optional();

const statusSchema = z
  .union([
    z.enum(infractionStatusEnum.enumValues),
    z.array(z.enum(infractionStatusEnum.enumValues)),
  ])
  .optional()
  .transform((value) => {
    if (typeof value === "string") return [value];
    return value;
  });

const severitySchema = z
  .union([
    z.enum(infractionSeverityEnum.enumValues),
    z.array(z.enum(infractionSeverityEnum.enumValues)),
  ])
  .optional()
  .transform((value) => {
    if (typeof value === "string") return [value];
    return value;
  });

export const InfractionSearchParamsSchema = z
  .object({
    query: z.string().trim().max(200).prefault(""),
    userId: optionalPositiveInt,
    festivalId: z
      .union([z.literal("none"), z.coerce.number().int().positive()])
      .optional(),
    festivalType: z.enum(festivalTypeEnum.enumValues).optional(),
    typeId: optionalPositiveInt,
    severity: severitySchema,
    status: statusSchema,
    userGaveNotice: optionalBoolean,
    hasSanction: optionalBoolean,
    sanctionStatus: z
      .enum(["scheduled", "active", "expired", "revoked"])
      .optional(),
    createdFrom: isoDateSchema,
    createdTo: isoDateSchema,
    resolvedFrom: isoDateSchema,
    sort: z.enum(["createdAt", "status"]).prefault("createdAt"),
    direction: z.enum(["asc", "desc"]).prefault("desc"),
    limit: pageSizeSchema,
    offset: z.coerce.number().int().min(0).prefault(0),
  })
  .superRefine((filters, ctx) => {
    if (
      filters.createdFrom &&
      filters.createdTo &&
      filters.createdFrom > filters.createdTo
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["createdTo"],
        message: "La fecha final no puede ser anterior a la fecha inicial",
      });
    }
  });

export type InfractionSearchParams = z.infer<
  typeof InfractionSearchParamsSchema
>;
