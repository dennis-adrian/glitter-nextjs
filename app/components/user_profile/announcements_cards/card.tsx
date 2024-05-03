import { fetchActiveFestival } from "@/app/data/festivals/actions";
import { ProfileType } from "@/app/api/users/definitions";
import MissingFieldsCard from "./missing-fields-card";
import PendingArtistCard from "./pending-artist-card";
import { isProfileInFestival } from "@/app/components/next_event/helpers";
import { ReserveStandCard } from "@/app/components/user_profile/announcements_cards/reserve-stand-card";
import { fetchStandById } from "@/app/api/stands/actions";
import { ReservedStandCard } from "@/app/components/user_profile/announcements_cards/reserved-stand-card";
import { isProfileComplete } from "@/app/lib/utils";
import { TermsCard } from "@/app/components/user_profile/announcements_cards/terms-card";

export default async function Card({ profile }: { profile: ProfileType }) {
  if (!profile || profile?.role === "admin") return null;

  if (!profile.verified) {
    if (isProfileComplete(profile)) {
      return <PendingArtistCard />;
    }

    return <MissingFieldsCard profile={profile} />;
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

    return <ReserveStandCard festival={festival} profile={profile} />;
  } else {
    return <TermsCard festival={festival} profile={profile} />;
  }
}
