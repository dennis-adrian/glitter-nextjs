import { fetchActiveFestival } from "@/app/api/festivals/actions";
import { UserProfileWithRequests } from "@/app/api/users/actions";
import BecomeArtistCard from "./become-artist";
import PendingArtistCard from "./pending-artist";

export default async function Card({
  profile,
}: {
  profile: UserProfileWithRequests;
}) {
  const festival = await fetchActiveFestival();
  if (!(profile && festival)) return null;

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
}
