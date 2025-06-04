import { BaseProfile, Participation } from "@/app/api/users/definitions";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { Badge } from "@/app/components/ui/badge";
import { getUserName } from "@/app/lib/users/utils";
import { isNewProfile } from "@/app/lib/utils";
import Image from "next/image";

type ProfileAvatarProps = {
  className?: string;
  profile: BaseProfile & { participations: Participation[] };
  showGlitterStamp?: boolean;
  showBadge?: boolean;
};
export default function ProfileAvatar(props: ProfileAvatarProps) {
  const { profile, showBadge = true } = props;
  const userName = getUserName(profile);

  return (
    <div className="relative flex justify-center">
      <Avatar className={props.className}>
        <AvatarImage
          src={profile?.imageUrl || "/img/placeholders/avatar-placeholder.png"}
          alt={
            userName ? `Imagen de perfil de ${userName}` : "Imagen de perfil"
          }
        />
      </Avatar>
      {props.showGlitterStamp && (
        <div className="absolute -top-1 -right-2 bg-white rounded-full p-0.5 z-20">
          <Image
            src="/img/glitter-stamp.svg"
            alt="glitter stamp"
            width={24}
            height={24}
          />
        </div>
      )}
      {showBadge && isNewProfile(profile) && (
        <div className="absolute -bottom-2">
          <Badge className="bg-white text-foreground" variant="outline">
            Nuevo
          </Badge>
        </div>
      )}
    </div>
  );
}
