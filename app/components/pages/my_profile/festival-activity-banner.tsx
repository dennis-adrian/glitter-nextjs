import { ProfileType } from "@/app/api/users/definitions";
import UploadStickerDesignModal from "@/app/components/festivals/festival_activities/upload-sticker-design-modal";
import { RedirectButton } from "@/app/components/redirect-button";
import { Button } from "@/app/components/ui/button";
import { profileHasReservation } from "@/app/helpers/next_event";
import { getActiveFestival } from "@/app/lib/festivals/helpers";
import { FileSpreadsheetIcon, UploadCloudIcon } from "lucide-react";

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

  const festivalActivity = festival.festivalActivities[0];
  const allParticipants = festivalActivity.details.flatMap(
    (detail) => detail.participants,
  );

  const isProfileInFestivalActivity = allParticipants.some(
    (participant) => participant.user.id === profile.id,
  );

  if (isProfileInFestivalActivity) {
    return (
      <div className="flex flex-col mdflex-row justify-center items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 md:p-4 text-amber-800">
        <p className="text-sm">
          Gracias por inscribirte en la actividad de{" "}
          <strong>{festival.name}</strong>. Si no subiste el diseño de tu
          sticker puedes hacerlo hasta el <strong>miércoles 16 de abril</strong>
          .
        </p>
        <div className="flex gap-2">
          <RedirectButton
            className="text-amber-800 underline"
            variant="outline"
            href={`/profiles/${profile.id}/festivals/${festival.id}/activity`}
          >
            <span>Ver detalles</span>
            <FileSpreadsheetIcon className="w-4 h-4 ml-2" />
          </RedirectButton>
          <UploadStickerDesignModal />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row justify-center items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 md:p-4 text-amber-800">
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
