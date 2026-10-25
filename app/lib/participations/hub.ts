import "server-only";

import { cache } from "react";

import type { ReservationWithParticipantsAndUsersAndStandAndCollaborators } from "@/app/api/reservations/definitions";
import type { ProfileType } from "@/app/api/users/definitions";
import type { UserRequestBase } from "@/app/api/user_requests/definitions";
import {
  getCardStatus,
  type CardStatus,
} from "@/app/components/participant_dashboard/reservation-card";
import { fetchOutstandingInvoiceCountByProfileAndFestival } from "@/app/data/invoices/actions";
import { isFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import type {
  FestivalActivityWithDetailsAndParticipants,
  FullFestival,
} from "@/app/lib/festivals/definitions";
import { getActiveFestival } from "@/app/lib/festivals/helpers";
import { fetchProfileEnrollmentInFestival } from "@/app/lib/festivals/actions";
import { fetchFestivalActivitiesByFestivalId } from "@/app/lib/festivals/queries";
import {
  getFestivalAvaibleStandsByCategory,
  scopeActivityToViewer,
} from "@/app/lib/festivals/utils";
import {
  buildPendingItems,
  buildSteps,
  resolveHubStatus,
  type EnrollmentStatus,
  type HubLinks,
  type HubPendingItem,
  type HubStatus,
  type HubStep,
} from "@/app/lib/participations/hub-status";
import { buildCatalogue } from "@/app/lib/programs/catalogue";
import { fetchCatalogue } from "@/app/lib/programs/data";
import { fetchActorReservationsByFestival } from "@/app/lib/reservations/queries";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export type ParticipationHub = {
  profile: ProfileType;
  festival: FullFestival;
  status: HubStatus;
  cardStatus: CardStatus;
  steps: HubStep[];
  pending: HubPendingItem[];
  links: HubLinks & {
    reservation: string | null;
    map: string;
    publicTerms: string;
  };
  enrollment: UserRequestBase | null;
  isGastronomy: boolean;
  isConfirmed: boolean;
  hasReservation: boolean;
  availableStands: number;
  outstandingInvoiceCount: number;
  reservationCount: number;
  /** The participant's reservation in this festival, confirmed or not. */
  reservation: ReservationWithParticipantsAndUsersAndStandAndCollaborators | null;
  teamCount: number;
  /** Each scoped to this profile: other participants' votes stay out. */
  activities: FestivalActivityWithDetailsAndParticipants[];
  /** Talks and workshops tied to this festival that have not happened yet. */
  sessions: UpcomingSession[];
  /** For the card's payment banner; the portal card reads the same field. */
  activeParticipations: ProfileType["participations"];
};

type UpcomingSession = Awaited<
  ReturnType<typeof fetchFestivalSessions>
>[number];

export type ParticipationHubResult =
  | { kind: "signed-out" }
  | { kind: "not-verified"; profile: ProfileType }
  | { kind: "no-festival"; profile: ProfileType }
  | ({ kind: "hub" } & ParticipationHub);

const LIVE_RESERVATION_STATUSES = new Set([
  "pending",
  "verification_payment",
  "accepted",
]);

async function fetchFestivalSessions(festivalId: number) {
  if (!(await isFeatureEnabled("paid_programs"))) return [];

  const catalogue = await fetchCatalogue();
  const linked = catalogue.sessions.filter(
    (session) =>
      session.festival?.id === festivalId ||
      session.program?.festival?.id === festivalId,
  );

  return buildCatalogue({
    sessions: linked,
    programs: catalogue.programs,
    now: new Date(),
  }).upcomingSessions;
}

/**
 * Everything the participation hub and its screens show, for the signed-in
 * participant and the active festival. Cached per request, so the hub and a
 * sub-screen rendered in the same request read it once.
 */
export const loadParticipationHub = cache(
  async (): Promise<ParticipationHubResult> => {
    const profile = await getCurrentUserProfile();
    if (!profile) return { kind: "signed-out" };
    // A profile still under review sees the public festival instead; the
    // tab already points there, this covers an old link or a bookmark.
    if (profile.status !== "verified") return { kind: "not-verified", profile };

    const festival = await getActiveFestival();
    if (!festival) return { kind: "no-festival", profile };

    const [enrollmentRow, reservations, rawActivities, sessions] =
      await Promise.all([
        fetchProfileEnrollmentInFestival(profile.id, festival.id),
        fetchActorReservationsByFestival(festival.id),
        fetchFestivalActivitiesByFestivalId(festival.id),
        fetchFestivalSessions(festival.id),
      ]);

    const enrollment: UserRequestBase | null =
      enrollmentRow ??
      profile.userRequests.find(
        (request) =>
          request.type === "festival_participation" &&
          request.festivalId === festival.id,
      ) ??
      null;

    const activeParticipations = profile.participations.filter(
      (participation) =>
        participation.reservation.festivalId === festival.id &&
        LIVE_RESERVATION_STATUSES.has(participation.reservation.status),
    );
    const hasReservation = activeParticipations.length > 0;

    const invoiceCounts = hasReservation
      ? await fetchOutstandingInvoiceCountByProfileAndFestival(
          profile.id,
          festival.id,
        )
      : { reservationCount: 0, outstandingInvoiceCount: 0 };

    const cardStatus = getCardStatus(
      enrollment,
      activeParticipations,
      invoiceCounts.outstandingInvoiceCount,
      festival.reservationsStartDate,
    );
    const availableStands = getFestivalAvaibleStandsByCategory(
      festival,
      profile.category,
    ).length;
    const status = resolveHubStatus({
      cardStatus,
      availableStands,
      reservationsOpen: new Date() >= festival.reservationsStartDate,
    });

    const liveReservations = reservations.filter((reservation) =>
      LIVE_RESERVATION_STATUSES.has(reservation.status),
    );
    const reservation =
      liveReservations.find((entry) => entry.status === "accepted") ??
      liveReservations[0] ??
      null;
    const isConfirmed = cardStatus === "confirmed_reservation";
    const teamCount = reservation?.collaborators.length ?? 0;
    const isGastronomy = profile.category === "gastronomy";
    const enrollmentStatus = (enrollment?.status ?? null) as EnrollmentStatus;

    const base = `/profiles/${profile.id}/festivals/${festival.id}`;
    const reservationIds = new Set(
      activeParticipations.map((participation) => participation.reservation.id),
    );
    const links = {
      terms: `${base}/terms`,
      reserve: `${base}/reservations/new`,
      invoices: `${base}/invoices`,
      products: "/my_participations/submit_products",
      team: "/my_participations/team",
      // A single reservation has a detail page; several go through the list.
      reservation:
        reservationIds.size === 1
          ? `${base}/reservations/${[...reservationIds][0]}`
          : null,
      map: `/festivals/${festival.id}#mapa`,
      publicTerms: `/festivals/${festival.id}/terms`,
    };

    return {
      kind: "hub",
      profile,
      festival,
      status,
      cardStatus,
      steps: buildSteps({
        isGastronomy,
        enrollmentStatus,
        hasReservation,
        isConfirmed,
      }),
      pending: buildPendingItems({
        status,
        isGastronomy,
        enrollmentStatus,
        hasReservation,
        isConfirmed,
        shouldSubmitProducts: Boolean(profile.shouldSubmitProducts),
        teamCount,
        links,
      }),
      links,
      enrollment,
      isGastronomy,
      isConfirmed,
      hasReservation,
      availableStands,
      outstandingInvoiceCount: invoiceCounts.outstandingInvoiceCount,
      reservationCount: invoiceCounts.reservationCount,
      reservation,
      teamCount,
      activities: rawActivities.map((activity) =>
        scopeActivityToViewer(activity, profile.id),
      ),
      sessions,
      activeParticipations,
    };
  },
);
