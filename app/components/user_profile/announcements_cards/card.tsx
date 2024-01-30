import { fetchActiveFestival } from "@/app/api/festivals/actions";
import { ProfileType } from "@/app/api/users/definitions";
import BecomeArtistCard from "./become-artist-card";
import PendingArtistCard from "./pending-artist-card";
import ParticipationCard from "./participation-card";
import PendingParticipationCard from "./pending-participation";

export default async function Card({
  profile,
}: {
  profile: ProfileType;
}) {
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

  const data = await fetchActiveFestival();
  if (!data.festival) return null;

  if (profile.role === "artist") {
    const participationRequest = profile.userRequests.find(
      (request) =>
        request.type === "festival_participation" &&
        request.festivalId === data.festival.id,
    );

    if (participationRequest) {
      return <PendingParticipationCard festival={data.festival} />;
    }

    return (
      <div className="my-4">
        <ParticipationCard festival={data.festival} profile={profile} />
      </div>
    );
  }
}
