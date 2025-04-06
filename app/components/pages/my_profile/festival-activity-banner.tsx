import { ProfileType } from "@/app/api/users/definitions";
import { RedirectButton } from "@/app/components/redirect-button";
import { profileHasReservation } from "@/app/helpers/next_event";
import { getActiveFestival } from "@/app/lib/festivals/helpers";

type FestivalActivityBannerProps = {
  profile: ProfileType;
};

export default async function FestivalActivityBanner({
  profile,
}: FestivalActivityBannerProps) {
  const festival = await getActiveFestival();

  if (!festival) return null;
  if (profile.category !== "illustration") return null;

  const hasReservation = profileHasReservation(profile, festival.id);

  if (!hasReservation) return null;

  return (
    <div className="flex flex-col md:flex-row justify-center items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800">
      <p className="text-sm">
        Tendremos una actividad especial en <strong>{festival.name}</strong> que
        te puede interesar. Los cupos son limitados. No te quedes fuera.
      </p>
      <RedirectButton
        className="text-amber-800 underline"
        variant="link"
        href={`/profiles/${profile.id}/festivals/${festival.id}/activity`}
      >
        Ver detalles
      </RedirectButton>
    </div>
  );
}
