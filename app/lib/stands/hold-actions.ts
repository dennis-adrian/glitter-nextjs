"use server";

import {
  cancelStandHold as cancelStandHoldService,
  confirmStandHold as confirmStandHoldService,
  createStandHold as createStandHoldService,
  getActiveHold as getActiveHoldService,
} from "@/app/lib/reservations/hold-service";
import { parseUnknown, positiveIntSchema } from "@/app/lib/reservations/schemas";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export async function createStandHold(standIdInput: unknown) {
  return createStandHoldService(standIdInput);
}

export async function cancelStandHold(holdIdInput: unknown) {
  return cancelStandHoldService(holdIdInput);
}

export async function confirmStandHold(
  holdIdInput: unknown,
  partnerIdInput?: unknown,
) {
  return confirmStandHoldService(holdIdInput, partnerIdInput);
}

export async function getActiveHold(festivalIdInput: unknown) {
  const actor = await getCurrentUserProfile();
  if (!actor) return null;
  const parsed = parseUnknown(positiveIntSchema, festivalIdInput);
  if (!parsed.success) return null;
  return getActiveHoldService(actor.id, parsed.data);
}
