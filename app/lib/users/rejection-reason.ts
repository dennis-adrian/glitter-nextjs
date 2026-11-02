import "server-only";

import { cache } from "react";

import type { BaseProfile } from "@/app/api/users/definitions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { latestRejectionReason } from "@/app/lib/users/status-events";
import { db } from "@/db";

const loadReason = cache(
  async (
    profileId: number,
    status: BaseProfile["status"],
  ): Promise<string | null> => {
    if (status !== "rejected") return null;

    const viewer = await getCurrentUserProfile();
    if (!viewer) return null;
    if (viewer.id !== profileId && viewer.role !== "admin") return null;

    return latestRejectionReason(db, profileId);
  },
);

/**
 * The team's reason for the profile's current rejection, for its owner or an
 * admin. Null when the profile is not rejected, when someone else asks, or
 * when the rejection predates stored reasons (2026-08-21): those went out
 * only by email. Cached per request, so Inicio and its tasks share one read.
 */
export function loadRejectionReason(
  profile: Pick<BaseProfile, "id" | "status">,
): Promise<string | null> {
  return loadReason(profile.id, profile.status);
}
