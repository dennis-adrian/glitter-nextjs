import { fetchActiveFestival } from "@/app/api/festivals/actions";
import { ProfileType } from "@/app/api/users/definitions";
import BecomeArtistCard from "./become-artist-card";
import PendingArtistCard from "./pending-artist-card";
import ParticipationCard from "./participation-card";
import PendingParticipationCard from "./pending-participation";
import { isProfileInFestival } from "@/app/components/next_event/helpers";
import { ReserveStandCard } from "@/app/components/user_profile/announcements_cards/reserve-stand-card";
import { fetchStandById } from "@/app/api/stands/actions";
import { ReservedStandCard } from "@/app/components/user_profile/announcements_cards/reserved-stand-card";

export default async function Card({ profile }: { profile: ProfileType }) {
  if (!profile) return null;

  if (profile.role === "user") {
    const becomeArtistRequest = profile.userRequests.find(
      (request) => request.type === "become_artist",
    );

    if (becomeArtistRequest) {
      return <PendingArtistCard />;
    }

    return <BecomeArtistCard profile={profile} />;
  }

  const festival = await fetchActiveFestival({});
  if (!festival) return null;

  if (isProfileInFestival(festival.id, profile)) {
    const currentFestivalResevation = profile.participations.find(
      (participation) => {
        return participation.reservation.festivalId === festival.id;
      },
    );

    if (currentFestivalResevation) {
      const standId = currentFestivalResevation.reservation.standId;
      const stand = await fetchStandById(standId);
      if (stand) {
        return <ReservedStandCard stand={stand} />;
      }
    }

    return <ReserveStandCard />;
  }

  if (profile.role === "artist") {
    const participationRequest = profile.userRequests.find(
      (request) =>
        request.type === "festival_participation" &&
        request.festivalId === festival.id,
    );

    if (participationRequest) {
      return <PendingParticipationCard festival={festival} />;
    }

    return <ParticipationCard festival={festival} profile={profile} />;
  }
}
