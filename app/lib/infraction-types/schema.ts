import { z } from "zod";

import { infractionSeverityEnum } from "@/db/schema";

const infractionTypeFields = {
  label: z
    .string()
    .trim()
    .min(3, "El nombre debe tener al menos 3 caracteres")
    .max(120, "El nombre no puede superar los 120 caracteres"),
  description: z
    .string()
    .trim()
    .min(20, "La descripción debe tener al menos 20 caracteres")
    .max(2000, "La descripción no puede superar los 2000 caracteres"),
  severity: z.enum(infractionSeverityEnum.enumValues),
};

export const createInfractionTypeSchema = z.object(infractionTypeFields);

export const updateInfractionTypeSchema = z.object({
  id: z.coerce.number().int().positive(),
  ...infractionTypeFields,
});

export const changeInfractionTypeActivitySchema = z.object({
  id: z.coerce.number().int().positive(),
  active: z.boolean(),
});

export type CreateInfractionTypeInput = z.infer<
  typeof createInfractionTypeSchema
>;

export type UpdateInfractionTypeInput = z.infer<
  typeof updateInfractionTypeSchema
>;

export type ChangeInfractionTypeActivityInput = z.infer<
  typeof changeInfractionTypeActivitySchema
>;

export function buildInfractionTypeCode(label: string) {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
}
