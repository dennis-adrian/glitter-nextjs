import { ProfileType } from "@/app/api/users/definitions";
import ProfileAvatar from "@/app/components/common/profile-avatar";
import { StandBase } from "@/app/api/stands/definitions";

type ProfileAvatarGroupProps = {
  profiles: ProfileType[];
  festivalId?: number;
  stand?: StandBase;
};
export default function ProfileAvatarGroup({
  profiles,
  festivalId,
  stand,
}: ProfileAvatarGroupProps) {
  return (
    <div className="flex justify-center -space-x-2">
      {profiles.map((profile, i) => {
        let showStamp = false;
        if (festivalId && stand) {
          const currentParticipation = profile.participations.find(
            (participation) =>
              participation.reservation.festivalId === festivalId &&
              participation.reservation.standId === stand.id,
          );
          showStamp = !!currentParticipation?.hasStamp;
        }

        return (
          <ProfileAvatar
            className={i === 0 ? "z-10" : ""}
            key={profile.id}
            profile={profile}
            showGlitterStamp={showStamp}
          />
        );
      })}
    </div>
  );
}
