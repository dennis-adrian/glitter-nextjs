import { StandBase } from "@/app/api/stands/definitions";
import { ProfileType } from "@/app/api/users/definitions";
import ProfileAvatar from "@/app/components/common/profile-avatar";
import { RedirectButton } from "@/app/components/redirect-button";

type ParticipantInfoProps = {
  profile: ProfileType;
  stand: StandBase;
};

export default function ParticipantInfo(props: ParticipantInfoProps) {
  return (
    <div className="relative p-4 border rounded-lg mt-8 border-primary-100">
      <div className="absolute top-0 left-0 w-full flex justify-center -translate-y-1/2">
        <ProfileAvatar profile={props.profile} />
      </div>
      <div className="flex flex-col items-center text-center h-full justify-between gap-2">
        <div className="mt-4">
          <h2 className="mt-4 max-w-[100px] overflow-hidden text-ellipsis font-semibold text-sm md:text-base">
            {props.profile.displayName}
          </h2>
          <h3 className="text-xs md:text-sm text-muted-foreground">
            {props.stand.label}
            {props.stand.standNumber}
          </h3>
        </div>
        <RedirectButton
          variant="link"
          size="sm"
          href={`/public_profiles/${props.profile.id}`}
        >
          Ver perfil
        </RedirectButton>
      </div>
    </div>
  );
}
