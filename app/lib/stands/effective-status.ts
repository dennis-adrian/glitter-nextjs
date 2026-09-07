import type { stands } from "@/db/schema";

type StandStatus = (typeof stands.$inferSelect)["status"];

export function deriveEffectiveStandStatus(
  storedStatus: StandStatus,
  standId: number,
  activeHoldStandIds: ReadonlySet<number>,
): StandStatus {
  if (storedStatus !== "held") return storedStatus;
  return activeHoldStandIds.has(standId) ? "held" : "available";
}
