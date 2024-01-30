import { fetchActiveFestival } from "@/app/api/festivals/actions";
import { UserProfileWithParticipationRequests } from "@/app/api/users/actions";
import BecomeArtistCard from "./become-artist";

export default async function Card({
  profile,
}: {
  profile: UserProfileWithParticipationRequests;
}) {
  const festival = await fetchActiveFestival();
  if (!(profile && festival)) return null;

  if (profile.role === "user") {
    return <BecomeArtistCard profile={profile} />;
  }
}
