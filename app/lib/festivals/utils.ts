// This methods should be used in both ui and sever

import { UserCategory } from "@/app/api/users/definitions";
import { getFestivalSectorAllowedCategories } from "../festival_sectors/helpers";
import { formatDate } from "@/app/lib/formatters";
import {
  Festival,
  FestivalActivityWithDetailsAndParticipants,
  FestivalBase,
  FestivalWithSectors,
} from "./definitions";

export function getFestivalAvaibleStandsByCategory(
  festival?: Festival | null,
  category?: UserCategory,
) {
  if (!(festival && category)) return [];
  const stands = festival.festivalSectors.flatMap((sector) => sector.stands);
  return stands.filter(
    (stand) => stand.status === "available" && stand.standCategory === category,
  );
}

export function getFestivalCategories(festival?: FestivalWithSectors | null) {
  if (!festival) return [];

  const sectorsCategories = festival.festivalSectors.flatMap((sector) =>
    getFestivalSectorAllowedCategories(sector, true),
  );

  return [...new Set(sectorsCategories)];
}

/**
 * An activity as a participant's own pages may hand it to client components,
 * for the profile `viewerId`: that profile keeps its own votes, waitlist entry,
 * removal reason and proof feedback. Everyone else keeps their profile and
 * design images, which the cards count and list, but not the votes they cast
 * (who voted for whom), their place on the waitlist, why they were removed, the
 * feedback staff left on their proofs or their unpublished promo text. A
 * client prop is serialized into the page whether or not the component reads
 * it.
 *
 * Staff screens read activities unscoped; never pass a staff viewer here
 * expecting the full activity back.
 */
export function scopeActivityToViewer(
  activity: FestivalActivityWithDetailsAndParticipants,
  viewerId: number | null,
): FestivalActivityWithDetailsAndParticipants {
  return {
    ...activity,
    details: activity.details.map((detail) => ({
      ...detail,
      votes: detail.votes.filter((vote) => vote.voterId === viewerId),
      participants: detail.participants.map((participant) =>
        participant.userId === viewerId
          ? participant
          : {
              ...participant,
              removalReason: null,
              proofs: participant.proofs.map((proof) => ({
                ...proof,
                adminFeedback: null,
                promoHighlight: null,
                promoDescription: null,
                promoConditions: null,
              })),
            },
      ),
    })),
    waitlistEntries: activity.waitlistEntries.filter(
      (entry) => entry.userId === viewerId,
    ),
  };
}

/**
 * A festival as a participant's own pages may hand it to client components,
 * for the profile `viewerId`. The roster — every enrolled profile with its
 * participations, and every reservation — carries other participants' contact
 * details, so it is dropped; the activities keep only what that profile may
 * see of other participants (`scopeActivityToViewer`). A client prop is
 * serialized into the page whether or not the component reads it.
 */
export function withoutParticipantRoster<
  T extends {
    userRequests: unknown[];
    standReservations: unknown[];
    festivalActivities: FestivalActivityWithDetailsAndParticipants[];
  },
>(festival: T, viewerId: number | null): T {
  return {
    ...festival,
    userRequests: [],
    standReservations: [],
    festivalActivities: festival.festivalActivities.map((activity) =>
      scopeActivityToViewer(activity, viewerId),
    ),
  };
}

export function getFestivalsOptions(festivals: FestivalBase[]) {
  return festivals.map((festival) => ({
    label: festival.name,
    value: festival.id.toString(),
  }));
}

/** A festival's days in calendar order; the relation comes back unordered. */
export function sortFestivalDates<T extends { startDate: Date }>(dates: T[]) {
  return [...dates].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
}

/**
 * The span of a festival's days in the store's time zone, as compact as it
 * reads unambiguously: "12 oct 2026", "12–13 oct 2026", "30 oct – 1 nov 2026",
 * "30 dic 2026 – 2 ene 2027". Null when the festival has no dates yet.
 */
export function formatFestivalDateRange(dates: { startDate: Date }[]) {
  if (dates.length === 0) return null;
  const sorted = sortFestivalDates(dates);
  const start = formatDate(sorted[0]!.startDate);
  const end = formatDate(sorted[sorted.length - 1]!.startDate);

  if (start.hasSame(end, "day")) return start.toFormat("d LLL yyyy");
  if (start.hasSame(end, "month")) {
    return `${start.toFormat("d")}–${end.toFormat("d LLL yyyy")}`;
  }
  if (start.hasSame(end, "year")) {
    return `${start.toFormat("d LLL")} – ${end.toFormat("d LLL yyyy")}`;
  }
  return `${start.toFormat("d LLL yyyy")} – ${end.toFormat("d LLL yyyy")}`;
}

const ADMIN_STATUS_ORDER: Record<FestivalBase["status"], number> = {
  active: 0,
  published: 1,
  draft: 2,
  archived: 3,
};

/**
 * The order the festivals list opens in: what is running first, then what is
 * being prepared, then the archive, each newest first by its first day.
 */
export function sortFestivalsForAdmin<
  T extends FestivalBase & { festivalDates: { startDate: Date }[] },
>(festivals: T[]) {
  const firstDay = (festival: T) =>
    sortFestivalDates(festival.festivalDates)[0]?.startDate.getTime() ??
    Number.NEGATIVE_INFINITY;

  return [...festivals].sort(
    (a, b) =>
      ADMIN_STATUS_ORDER[a.status] - ADMIN_STATUS_ORDER[b.status] ||
      firstDay(b) - firstDay(a) ||
      b.id - a.id,
  );
}

/** Whether `now` falls on one of the festival's days, in the store's zone. */
export function isFestivalDay(dates: { startDate: Date }[], now = new Date()) {
  const today = formatDate(now).startOf("day");
  return dates.some((date) =>
    formatDate(date.startDate).startOf("day").equals(today),
  );
}
