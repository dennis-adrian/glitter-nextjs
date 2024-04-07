import { fetchStandsByFestivalId } from "@/app/api/stands/actions";
import { ProfileType, UserCategory } from "@/app/api/users/definitions";
import ClientMap from "@/app/components/festivals/client-map";
import { FestivalBase } from "@/app/data/festivals/definitions";

export default async function FestivalMap({
  profile,
  festival,
  zone,
}: {
  festival: FestivalBase;
  profile: ProfileType | null;
  zone: UserCategory;
}) {
  const stands = await fetchStandsByFestivalId(festival.id);

  return <ClientMap profile={profile} stands={stands} />;
}
