"use server";

import {
  cancelStandHold as cancelStandHoldService,
  confirmStandHold as confirmStandHoldService,
  createStandHold as createStandHoldService,
  getActiveHold as getActiveHoldService,
} from "@/app/lib/reservations/hold-service";
import { reservationFailure } from "@/app/lib/reservations/errors";
import {
  parseConfirmHoldInput,
  parseUnknown,
  positiveIntSchema,
  type ConfirmStandHoldInput,
} from "@/app/lib/reservations/schemas";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export async function createStandHold(standIdInput: unknown) {
  return createStandHoldService(standIdInput);
}

export async function cancelStandHold(holdIdInput: unknown) {
  return cancelStandHoldService(holdIdInput);
}

export async function confirmStandHold(input: ConfirmStandHoldInput) {
  const parsed = parseConfirmHoldInput(input);
  if (!parsed.success) return reservationFailure("VALIDATION");

  return confirmStandHoldService({
    holdId: parsed.data.holdId,
    partnerId: parsed.data.partnerId,
    idempotencyKey: parsed.data.idempotencyKey,
  });
}

export async function getActiveHold(festivalIdInput: unknown) {
  const actor = await getCurrentUserProfile();
  if (!actor) return null;
  const parsed = parseUnknown(positiveIntSchema, festivalIdInput);
  if (!parsed.success) return null;
  return getActiveHoldService(actor.id, parsed.data);
}
