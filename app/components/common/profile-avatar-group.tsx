import { ProfileType } from "@/app/api/users/definitions";
import ProfileAvatar from "@/app/components/common/profile-avatar";

type ProfileAvatarGroupProps = {
  profiles: ProfileType[];
};
export default function ProfileAvatarGroup(props: ProfileAvatarGroupProps) {
  return (
    <div className="flex justify-center -space-x-4">
      {props.profiles.map((profile) => {
        return <ProfileAvatar key={profile.id} profile={profile} />;
      })}
    </div>
  );
}
