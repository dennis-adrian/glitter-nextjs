import { Participation } from "@/app/api/users/definitions";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { Badge } from "@/app/components/ui/badge";
import { getUserName } from "@/app/lib/users/utils";
import { isNewProfile } from "@/app/lib/utils";
import Image from "next/image";

type ProfileAvatarProps = {
  className?: string;
  profile: {
    displayName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    imageUrl: string | null;
    participations?: Participation[];
  };
  showGlitterStamp?: boolean;
  showBadge?: boolean;
  isNew?: boolean;
  /** Rendered width of the avatar, so the browser can pick a matching file. */
  sizes?: string;
};
export default function ProfileAvatar(props: ProfileAvatarProps) {
  const { profile, showBadge = true } = props;
  const userName = getUserName(profile);
  const showNewBadge =
    showBadge &&
    (props.isNew ??
      (profile.participations != null &&
        isNewProfile({ participations: profile.participations })));

  return (
    <div className="relative flex justify-center">
      <Avatar className={props.className}>
        <AvatarImage
          src={profile?.imageUrl}
          alt={
            userName ? `Imagen de perfil de ${userName}` : "Imagen de perfil"
          }
          sizes={props.sizes}
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
      {showNewBadge && (
        <div className="absolute -bottom-2 z-10">
          <Badge className="bg-white text-foreground" variant="outline">
            Nuevo
          </Badge>
        </div>
      )}
    </div>
  );
}
