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
          // `reservation.standId` is only the half picked first, so a
          // participant holding a full table lost their stamp on its second
          // stand. `members` is what the reservation occupies; the root is the
          // fallback for a participation loaded without them.
          const currentParticipation = profile.participations.find(
            (participation) => {
              if (participation.reservation.festivalId !== festivalId) {
                return false;
              }
              const members = participation.reservation.members;
              if (!members || members.length === 0) {
                return participation.reservation.standId === stand.id;
              }
              return members.some(
                (member) =>
                  member.stand.id === stand.id && member.releasedAt == null,
              );
            },
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
