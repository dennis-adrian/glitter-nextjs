import { fetchStandById } from "@/app/api/stands/actions";
import { ProfileType } from "@/app/api/users/definitions";
import { isProfileInFestival } from "@/app/components/next_event/helpers";
import { ReserveStandCard } from "@/app/components/user_profile/announcements_cards/reserve-stand-card";
import { ReservedStandCard } from "@/app/components/user_profile/announcements_cards/reserved-stand-card";
import { TermsCard } from "@/app/components/user_profile/announcements_cards/terms-card";
import { isProfileComplete } from "@/app/lib/utils";
import PendingVerificationCard from "./pending-verification-card";
import RejectedProfileCard from "./rejected-profile.card";
import { fetchFestival } from "@/app/lib/festivals/actions";

export default async function Card({ profile }: { profile: ProfileType }) {
  if (!profile || profile?.role === "admin") return null;

  if (profile.status === "rejected") {
    return <RejectedProfileCard />;
  }

  if (profile.status !== "verified") {
    if (isProfileComplete(profile)) {
      return <PendingVerificationCard />;
    }
  }

  const festival = await fetchFestival({});
  if (!festival) return null;

  if (isProfileInFestival(festival.id, profile)) {
    const festivalParticipations = profile.participations.filter(
      (participation) => participation.reservation.festivalId === festival.id,
    );
    const nonRejectedParticipations = festivalParticipations.filter(
      (p) => p.reservation.status !== "rejected",
    );

    if (nonRejectedParticipations.length > 0) {
      const sortedByMostRecent = [...nonRejectedParticipations].sort(
        (a, b) =>
          b.reservation.createdAt.getTime() - a.reservation.createdAt.getTime(),
      );
      const representative = sortedByMostRecent[0];
      const standId = representative.reservation.standId;
      const stand = await fetchStandById(standId);
      if (stand) {
        return (
          <ReservedStandCard
            festival={festival}
            stand={stand}
            reservationStatus={representative.reservation.status}
          />
        );
      }
    }

    return <ReserveStandCard festival={festival} profile={profile} />;
  } else {
    return <TermsCard festival={festival} profile={profile} />;
  }
}
