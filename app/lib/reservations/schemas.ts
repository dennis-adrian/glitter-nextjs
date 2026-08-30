import { z } from "zod";

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
  idempotencyKey: uuidSchema.optional(),
});

export const holdIdSchema = z.object({
  holdId: positiveIntSchema,
  idempotencyKey: uuidSchema.optional(),
});

export const confirmHoldSchema = z.object({
  holdId: positiveIntSchema,
  partnerId: positiveIntSchema.optional(),
  idempotencyKey: uuidSchema.optional(),
});

export const invoiceIdSchema = z.object({
  invoiceId: positiveIntSchema,
});

export const submitPaymentProofSchema = z.object({
  invoiceId: positiveIntSchema,
  voucherUrl: z.url(),
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
  const asObject = parseUnknown(holdStandIdSchema, input);
  if (asObject.success) return asObject;
  const asId = parseUnknown(positiveIntSchema, input);
  if (asId.success) {
    return { success: true as const, data: { standId: asId.data } };
  }
  return { success: false as const };
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

export function parseConfirmHoldInput(
  holdIdInput: unknown,
  partnerIdInput?: unknown,
) {
  const asObject = parseUnknown(confirmHoldSchema, holdIdInput);
  if (asObject.success) return asObject;
  const holdId = parseUnknown(positiveIntSchema, holdIdInput);
  if (!holdId.success) return { success: false as const };
  let partnerId: number | undefined;
  if (partnerIdInput !== undefined && partnerIdInput !== null) {
    const partner = parseUnknown(positiveIntSchema, partnerIdInput);
    if (!partner.success) return { success: false as const };
    partnerId = partner.data;
  }
  return {
    success: true as const,
    data: { holdId: holdId.data, partnerId },
  };
}
