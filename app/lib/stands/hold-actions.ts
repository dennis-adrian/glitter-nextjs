"use server";

import {
  cancelStandHold as cancelStandHoldService,
  confirmStandHold as confirmStandHoldService,
  createStandHold as createStandHoldService,
} from "@/app/lib/reservations/hold-service";
import { reservationFailure } from "@/app/lib/reservations/errors";
import {
  parseConfirmHoldInput,
  type ConfirmStandHoldInput,
} from "@/app/lib/reservations/schemas";

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
