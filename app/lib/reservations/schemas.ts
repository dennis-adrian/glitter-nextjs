import { z } from "zod";

import { externalParticipantInputSchema } from "@/app/lib/external_participants/schema";

export const positiveIntSchema = z.coerce.number().int().positive();

export const uuidSchema = z.string().uuid();

export const moneyAmountSchema = z
  .number()
  .finite()
  .multipleOf(0.01)
  .min(0)
  .max(99_999_999.99);

export const holdStandIdSchema = z.object({
  standId: positiveIntSchema,
  idempotencyKey: uuidSchema,
});

export const holdIdSchema = z.object({
  holdId: positiveIntSchema,
  idempotencyKey: uuidSchema.optional(),
});

export const confirmHoldSchema = z.object({
  holdId: positiveIntSchema,
  partnerId: positiveIntSchema.optional(),
  idempotencyKey: uuidSchema,
});

export type ConfirmStandHoldInput = z.infer<typeof confirmHoldSchema>;

export const invoiceIdSchema = z.object({
  invoiceId: positiveIntSchema,
});

export const submitPaymentProofSchema = z.object({
  invoiceId: positiveIntSchema,
  voucherUrl: z.url(),
  fileKey: z.string().trim().min(1).max(500),
  source: z.literal("uploadthing"),
  idempotencyKey: uuidSchema.optional(),
});

export const submitZeroValueInvoiceSchema = z.object({
  invoiceId: positiveIntSchema,
  idempotencyKey: uuidSchema,
});

export const adminConfirmReservationSchema = z.object({
  invoiceId: positiveIntSchema,
  idempotencyKey: uuidSchema,
  markAsPaid: z.boolean().optional(),
});

export const correctSettlementProofSchema = z.object({
  invoiceId: positiveIntSchema,
  reason: z.string().trim().min(1).max(1000),
});

export const reviewFestivalParticipationRequestSchema = z.object({
  requestId: positiveIntSchema,
  status: z.enum(["accepted", "rejected"]),
  reason: z.string().trim().max(1000).optional(),
});

export const reviewBecomeArtistRequestSchema = z.object({
  requestId: positiveIntSchema,
  status: z.enum(["accepted", "rejected"]),
});

export const createExternalReservationSchema = z
  .object({
    festivalId: positiveIntSchema,
    standId: positiveIntSchema,
    idempotencyKey: uuidSchema,
    externalParticipantId: positiveIntSchema.optional(),
    externalParticipant: externalParticipantInputSchema.optional(),
    revealAt: z.coerce.date().nullable().optional(),
  })
  .refine(
    (data) => {
      const hasId = data.externalParticipantId != null;
      const hasNew = data.externalParticipant != null;
      return hasId !== hasNew;
    },
    {
      message:
        "Indicá un participante existente o los datos de uno nuevo, no ambos",
    },
  );

export const submissionIdSchema = z.object({
  submissionId: positiveIntSchema,
});

export const rejectSettlementSchema = z.object({
  submissionId: positiveIntSchema,
  reason: z.string().trim().min(1).max(1000),
  correction: z.discriminatedUnion("type", [
    z.object({ type: z.literal("keep_amount") }),
    z.object({ type: z.literal("restore_amount") }),
    z.object({
      type: z.literal("set_amount"),
      amount: moneyAmountSchema,
    }),
    z.object({
      type: z.literal("cancel_reservation"),
      reason: z.string().trim().max(1000).optional(),
    }),
  ]),
});

export const cancelReservationSchema = z.object({
  reservationId: positiveIntSchema,
  reason: z.string().trim().max(1000).optional(),
});

export const updateReservationPartnerSchema = z.object({
  reservationId: positiveIntSchema,
  partnerUserId: positiveIntSchema.nullable(),
});

export const applyDiscountSchema = z.object({
  invoiceId: positiveIntSchema,
  code: z.string().trim().min(1).max(64),
});

export const reservationIdSchema = z.object({
  reservationId: positiveIntSchema,
});

export const rejectReservationSchema = z.object({
  reservationId: positiveIntSchema,
  reason: z.string().trim().max(1000).optional(),
});

export const addCollaboratorSchema = z.object({
  reservationId: positiveIntSchema,
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  identificationNumber: z.string().trim().min(5).max(40),
  collaboratorId: positiveIntSchema.optional(),
});

export const deleteCollaboratorSchema = z.object({
  reservationId: positiveIntSchema,
  collaboratorId: positiveIntSchema,
});

export const createAdminReservationSchema = z.object({
  festivalId: positiveIntSchema,
  standId: positiveIntSchema,
  ownerUserId: positiveIntSchema,
  partnerId: positiveIntSchema.optional(),
  revealAt: z.coerce.date().nullable().optional(),
  idempotencyKey: uuidSchema,
});

export const extendDeadlineSchema = z.object({
  reservationId: positiveIntSchema,
  dueAt: z.coerce.date(),
});

export const discountCodeMutationSchema = z.object({
  code: z.string().trim().min(1).max(64),
  discountUnit: z.enum(["percentage", "amount"]),
  discountValue: moneyAmountSchema,
  maxUses: z.number().int().positive().nullable().optional(),
  expiresAt: z.coerce.date(),
  isActive: z.boolean().optional(),
  festivalId: positiveIntSchema.nullable().optional(),
  userId: positiveIntSchema.nullable().optional(),
});

export function parseUnknown<T>(
  schema: z.ZodType<T>,
  input: unknown,
): { success: true; data: T } | { success: false } {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { success: false };
  return { success: true, data: parsed.data };
}

export function parseHoldStandInput(input: unknown) {
  return parseUnknown(holdStandIdSchema, input);
}

export function parseHoldIdInput(input: unknown) {
  const asObject = parseUnknown(holdIdSchema, input);
  if (asObject.success) return asObject;
  const asId = parseUnknown(positiveIntSchema, input);
  if (asId.success) {
    return { success: true as const, data: { holdId: asId.data } };
  }
  return { success: false as const };
}

export function parseConfirmHoldInput(input: unknown) {
  return parseUnknown(confirmHoldSchema, input);
}
