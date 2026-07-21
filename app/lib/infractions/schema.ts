import { z } from "zod";

import { INFRACTION_DUPLICATE_WINDOW_HOURS } from "@/app/lib/infractions/constants";
import { infractionStatusEnum } from "@/db/schema";

const positiveInt = z.coerce.number().int().positive();

export const registerInfractionSchema = z
  .object({
    userId: positiveInt,
    typeId: positiveInt,
    festivalId: positiveInt.nullable().optional(),
    description: z.string().trim().max(2000).optional().or(z.literal("")),
    userGaveNotice: z.boolean(),
    gaveNoticeAt: z.coerce.date().nullable().optional(),
    idempotencyKey: z.string().uuid(),
    confirmDuplicate: z.boolean().optional().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.userGaveNotice) {
      if (!data.gaveNoticeAt) {
        ctx.addIssue({
          code: "custom",
          path: ["gaveNoticeAt"],
          message: "Indicá cuándo el participante dio aviso",
        });
      }
    } else if (data.gaveNoticeAt != null) {
      ctx.addIssue({
        code: "custom",
        path: ["gaveNoticeAt"],
        message: "La fecha de aviso solo aplica si el participante dio aviso",
      });
    }
  });

export type RegisterInfractionInput = z.infer<typeof registerInfractionSchema>;

export const editInfractionSchema = z
  .object({
    infractionId: positiveInt,
    typeId: positiveInt,
    festivalId: positiveInt.nullable(),
    description: z.string().trim().max(2000).nullable(),
    userGaveNotice: z.boolean(),
    gaveNoticeAt: z.coerce.date().nullable(),
    reason: z.string().trim().min(1, "Indicá el motivo del cambio").max(1000),
  })
  .superRefine((data, ctx) => {
    if (data.userGaveNotice) {
      if (!data.gaveNoticeAt) {
        ctx.addIssue({
          code: "custom",
          path: ["gaveNoticeAt"],
          message: "Indicá cuándo el participante dio aviso",
        });
      }
    } else if (data.gaveNoticeAt != null) {
      ctx.addIssue({
        code: "custom",
        path: ["gaveNoticeAt"],
        message: "La fecha de aviso solo aplica si el participante dio aviso",
      });
    }
  });

export type EditInfractionInput = z.infer<typeof editInfractionSchema>;

export const changeInfractionStatusSchema = z
  .object({
    infractionId: positiveInt,
    toStatus: z.enum(infractionStatusEnum.enumValues),
    note: z.string().trim().max(2000).optional().or(z.literal("")),
    voidReason: z.string().trim().max(2000).optional().or(z.literal("")),
    resolutionNotes: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.toStatus === "voided" && !data.voidReason?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["voidReason"],
        message: "El motivo de anulación es obligatorio",
      });
    }
  });

export type ChangeInfractionStatusInput = z.infer<
  typeof changeInfractionStatusSchema
>;

export const addInfractionNoteSchema = z.object({
  infractionId: positiveInt,
  content: z.string().trim().min(1, "La nota es obligatoria").max(5000),
});

export type AddInfractionNoteInput = z.infer<typeof addInfractionNoteSchema>;

export const addInfractionEvidenceSchema = z.object({
  infractionId: positiveInt,
  url: z.url("URL de evidencia inválida"),
  label: z.string().trim().max(200).optional().or(z.literal("")),
  mimeType: z.string().trim().max(100).optional().or(z.literal("")),
});

export type AddInfractionEvidenceInput = z.infer<
  typeof addInfractionEvidenceSchema
>;

export { INFRACTION_DUPLICATE_WINDOW_HOURS };
