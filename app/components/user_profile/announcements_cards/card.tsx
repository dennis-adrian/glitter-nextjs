import { fetchActiveFestival } from "@/app/api/festivals/actions";
import { ProfileType } from "@/app/api/users/definitions";
import BecomeArtistCard from "./become-artist-card";
import PendingArtistCard from "./pending-artist-card";
import ParticipationCard from "./participation-card";
import PendingParticipationCard from "./pending-participation";
import { isProfileInFestival } from "@/app/components/next_event/helpers";
import { ReserveStandCard } from "@/app/components/user_profile/announcements_cards/reserve-stand-card";

export default async function Card({ profile }: { profile: ProfileType }) {
  if (!profile) return null;

  if (profile.role === "user") {
    const becomeArtistRequest = profile.userRequests.find(
      (request) => request.type === "become_artist",
    );

    if (becomeArtistRequest) {
      return <PendingArtistCard />;
    }

    return (
      <div className="my-4">
        <BecomeArtistCard profile={profile} />
      </div>
    );
  }

  const festival = await fetchActiveFestival({});
  if (!festival) return null;

  if (isProfileInFestival(festival.id, profile)) {
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

    return (
      <div className="my-4">
        <ParticipationCard festival={festival} profile={profile} />
      </div>
    );
  }
}
