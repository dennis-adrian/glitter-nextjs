import { BaseProfile, Participation } from "@/app/api/users/definitions";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { Badge } from "@/app/components/ui/badge";
import { getUserName } from "@/app/lib/users/utils";
import { isNewProfile } from "@/app/lib/utils";

type ProfileAvatarProps = {
  className?: string;
  profile: BaseProfile & { participations: Participation[] };
};
export default function ProfileAvatar(props: ProfileAvatarProps) {
  const { profile } = props;
  const userName = getUserName(profile);

  return (
    <div className="relative flex justify-center">
      <Avatar className={props.className || ""}>
        <AvatarImage
          src={profile.imageUrl || "/img/profile-avatar.png"}
          alt={
            userName ? `Imagen de perfil de ${userName}` : "Imagen de perfil"
          }
        />
      </Avatar>
      {isNewProfile(profile) && (
        <div className="absolute -bottom-2">
          <Badge className="bg-white text-foreground" variant="outline">
            Nuevo
          </Badge>
        </div>
      )}
    </div>
  );
}
