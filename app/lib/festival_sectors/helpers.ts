import { UserCategory } from "@/app/api/users/definitions";
import {
  ActivityDetailsWithParticipants,
  FestivalActivityWithDetailsAndParticipants,
  WaitlistEntryWithUser,
} from "@/app/lib/festivals/definitions";

export function getFestivalSectorAllowedCategories(
  sector: { stands: Array<{ standCategory: UserCategory }> },
  allCategories?: boolean,
): UserCategory[] {
  const categories = [
    ...new Set(sector.stands.map((stand) => stand.standCategory)),
  ];

  if (allCategories) return categories;

  return categories.filter((category) => category !== "new_artist");
}

export function isProfileEnrolledInActivity(
  profileId: number,
  activity: FestivalActivityWithDetailsAndParticipants,
) {
  return activity.details.some((detail) =>
    detail.participants.some((participant) => participant.userId === profileId),
  );
}

export function getUserWaitlistEntry(
  userId: number,
  activity: FestivalActivityWithDetailsAndParticipants,
): WaitlistEntryWithUser | null {
  return (
    activity.waitlistEntries.find((entry) => entry.userId === userId) ?? null
  );
}

/**
 * Whether `detail` has no seat open to `profileId`, by the count
 * `enrollInActivity` refuses on: active participants, other profiles'
 * unexpired invitations to the variant and, on an activity with a waitlist,
 * the waiters a promotion would invite before that profile (not yet invited,
 * of the variant's category, with no participation in the activity). An
 * unlimited variant is never full.
 *
 * It reads the whole waitlist, which a scoped activity no longer has, so the
 * answer a scoped variant carries in `fullForViewer` wins.
 */
export function isActivityDetailFullFor(
  activity: FestivalActivityWithDetailsAndParticipants,
  detail: ActivityDetailsWithParticipants,
  profileId: number | null,
  now: Date = new Date(),
): boolean {
  if (detail.fullForViewer !== undefined) return detail.fullForViewer;

  const limit = detail.participationLimit;
  if (!limit || limit <= 0) return false;

  const activeCount = detail.participants.filter(
    (p) => p.removedAt === null,
  ).length;
  const reservedCount = activity.waitlistEntries.filter(
    (entry) =>
      entry.userId !== profileId &&
      entry.notifiedForDetailId === detail.id &&
      entry.expiresAt !== null &&
      new Date(entry.expiresAt) > now,
  ).length;
  if (activeCount + reservedCount >= limit) return true;
  if (!activity.waitlistWindowMinutes) return false;

  const ownEntry = activity.waitlistEntries.find(
    (entry) => entry.userId === profileId,
  );
  const hasOwnInvitation =
    ownEntry?.notifiedAt != null &&
    ownEntry.notifiedForDetailId === detail.id &&
    ownEntry.expiresAt !== null &&
    new Date(ownEntry.expiresAt) > now;
  if (hasOwnInvitation) return false;

  const inActivity = new Set(
    activity.details.flatMap((d) => d.participants.map((p) => p.userId)),
  );
  const aheadCount = activity.waitlistEntries.filter(
    (entry) =>
      entry.userId !== profileId &&
      entry.notifiedAt === null &&
      (detail.category === null || entry.user.category === detail.category) &&
      !inActivity.has(entry.userId) &&
      (!ownEntry || entry.position < ownEntry.position),
  ).length;
  return activeCount + reservedCount + aheadCount >= limit;
}
