"use server";

import {
  cancelStandHold as cancelStandHoldService,
  cleanupExpiredHolds as cleanupExpiredHoldsService,
  confirmStandHold as confirmStandHoldService,
  createStandHold as createStandHoldService,
  fetchHoldWithStand as fetchHoldWithStandService,
  getActiveHold as getActiveHoldService,
} from "@/app/lib/reservations/hold-service";

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

export async function fetchHoldWithStand(
  holdId: number,
  userId: number,
  festivalId: number,
) {
  return fetchHoldWithStandService(holdId, userId, festivalId);
}

export async function getActiveHold(userId: number, festivalId: number) {
  return getActiveHoldService(userId, festivalId);
}

export async function cleanupExpiredHolds() {
  return cleanupExpiredHoldsService();
}
