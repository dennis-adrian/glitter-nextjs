import { z } from "zod";

import {
  durationUnitEnum,
  sanctionFestivalScopeEnum,
  sanctionTypeEnum,
} from "@/db/schema";

const positiveInt = z.coerce.number().int().positive();

const calendarUnits = ["minutes", "hours", "days", "months", "years"] as const;

export const createSanctionSchema = z
  .object({
    userId: positiveInt,
    infractionIds: z
      .array(positiveInt)
      .min(1, "Seleccioná al menos una infracción"),
    type: z.enum(sanctionTypeEnum.enumValues),
    description: z.string().trim().max(2000).optional().or(z.literal("")),
    festivalScope: z.enum(sanctionFestivalScopeEnum.enumValues),
    validityUnit: z.enum(durationUnitEnum.enumValues),
    validityDuration: z.coerce.number().int().positive().nullable().optional(),
    startsAt: z.coerce.date(),
    reservationDelayMinutes: z.coerce
      .number()
      .int()
      .positive()
      .nullable()
      .optional(),
  })
  .superRefine((data, ctx) => {
    const uniqueIds = new Set(data.infractionIds);
    if (uniqueIds.size !== data.infractionIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["infractionIds"],
        message: "Hay infracciones duplicadas en la selección",
      });
    }

    if (data.validityUnit === "indefinitely") {
      if (data.validityDuration != null) {
        ctx.addIssue({
          code: "custom",
          path: ["validityDuration"],
          message: "La validez indefinida no admite duración",
        });
      }
    } else if (data.validityDuration == null || data.validityDuration <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["validityDuration"],
        message: "Indicá una duración de validez positiva",
      });
    }

    if (
      data.validityUnit === "festivals" &&
      (data.validityDuration == null || data.validityDuration <= 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["validityDuration"],
        message: "Indicá cuántos festivales aplican",
      });
    }

    if (
      (calendarUnits as readonly string[]).includes(data.validityUnit) &&
      (data.validityDuration == null || data.validityDuration <= 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["validityDuration"],
        message: "La duración de calendario es obligatoria",
      });
    }

    if (data.type === "reservation_delay") {
      if (
        data.reservationDelayMinutes == null ||
        data.reservationDelayMinutes <= 0
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["reservationDelayMinutes"],
          message:
            "El retraso de reserva debe ser un número positivo de minutos",
        });
      }
    } else if (data.reservationDelayMinutes != null) {
      ctx.addIssue({
        code: "custom",
        path: ["reservationDelayMinutes"],
        message: "El retraso solo aplica al tipo retraso de reserva",
      });
    }
  });

export type CreateSanctionInput = z.infer<typeof createSanctionSchema>;

export const editSanctionSchema = z
  .object({
    sanctionId: positiveInt,
    description: z.string().trim().max(2000).nullable(),
    festivalScope: z.enum(sanctionFestivalScopeEnum.enumValues),
    validityUnit: z.enum(durationUnitEnum.enumValues),
    validityDuration: z.coerce.number().int().positive().nullable(),
    startsAt: z.coerce.date(),
    reservationDelayMinutes: z.coerce.number().int().positive().nullable(),
    addInfractionIds: z.array(positiveInt).optional().default([]),
    removeInfractionIds: z.array(positiveInt).optional().default([]),
    reason: z.string().trim().min(1, "Indicá el motivo del cambio").max(1000),
  })
  .superRefine((data, ctx) => {
    const addIds = new Set(data.addInfractionIds);
    const removeIds = new Set(data.removeInfractionIds);
    if (addIds.size !== data.addInfractionIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["addInfractionIds"],
        message: "Hay infracciones duplicadas para agregar",
      });
    }
    if (removeIds.size !== data.removeInfractionIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["removeInfractionIds"],
        message: "Hay infracciones duplicadas para quitar",
      });
    }
    if (data.addInfractionIds.some((id) => removeIds.has(id))) {
      ctx.addIssue({
        code: "custom",
        path: ["addInfractionIds"],
        message: "Una infracción no puede agregarse y quitarse al mismo tiempo",
      });
    }

    if (data.validityUnit === "indefinitely") {
      if (data.validityDuration != null) {
        ctx.addIssue({
          code: "custom",
          path: ["validityDuration"],
          message: "La validez indefinida no admite duración",
        });
      }
    } else if (data.validityDuration == null || data.validityDuration <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["validityDuration"],
        message: "Indicá una duración de validez positiva",
      });
    }

    // reservation delay validation needs type from DB; enforced in action
  });

export type EditSanctionInput = z.infer<typeof editSanctionSchema>;

export const revokeSanctionSchema = z.object({
  sanctionId: positiveInt,
  revocationReason: z
    .string()
    .trim()
    .min(1, "El motivo de revocación es obligatorio")
    .max(2000),
});

export type RevokeSanctionInput = z.infer<typeof revokeSanctionSchema>;

export const searchEligibleInfractionsSchema = z.object({
  userId: positiveInt,
  query: z.string().trim().max(100).optional().default(""),
  excludeInfractionIds: z.array(positiveInt).optional().default([]),
  limit: z.coerce.number().int().min(1).max(30).default(15),
});

export type SearchEligibleInfractionsInput = z.infer<
  typeof searchEligibleInfractionsSchema
>;
