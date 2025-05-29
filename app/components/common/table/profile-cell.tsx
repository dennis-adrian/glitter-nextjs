import { BaseProfile } from "@/app/api/users/definitions";
import CopyToClipboardButton from "@/app/components/common/copy-to-clipboard-button";
import SocialMediaBadge from "@/app/components/social-media-badge";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";

export default function ProfileCell({ profile }: { profile: BaseProfile }) {
  return (
    <div className="flex gap-2 items-center" key={profile.id}>
      <Avatar className="w-8 h-8">
        <AvatarImage
          src={profile.imageUrl!}
          alt={
            profile.displayName
              ? `Imagen de perfil de ${profile.displayName}`
              : "Imagen de perfil"
          }
        />
      </Avatar>
      <div className="flex flex-col">
        <span>
          <span className="text-muted-foreground mr-1">#{profile.id}</span>
          <span className="font-semibold mr-1">{profile.displayName}</span>
        </span>
        <span className="text-muted-foreground text-sm flex gap-1 items-center">
          {profile.email}
          <CopyToClipboardButton text={profile.email} iconOnly />
        </span>
        <span className="text-muted-foreground text-sm flex gap-1 items-center">
          +591 {profile.phoneNumber}
          <CopyToClipboardButton text={`591${profile.phoneNumber}`} iconOnly />
        </span>
        {profile.phoneNumber && (
          <SocialMediaBadge
            socialMediaType="whatsapp"
            username={profile.phoneNumber}
          />
        )}
      </div>
    </div>
  );
}
