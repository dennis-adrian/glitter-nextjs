import { BaseProfile, ProfileType } from "@/app/api/users/definitions";
import SocialMediaBadge from "@/app/components/social-media-badge";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { Badge } from "@/app/components/ui/badge";

export default function UserInfoCell({
  profile: profile,
}: {
  profile: ProfileType;
}) {
  const fullName =
    `${profile.firstName || ""} ${profile.lastName || ""}` || "Sin nombre";
  return (
    <div className="flex gap-4 items-center">
      <div className="relative">
        <Avatar className="w-16 h-16">
          <AvatarImage alt="avatar" src={profile.imageUrl!} />
        </Avatar>
        {profile.category === "new_artist" && (
          <div className="absolute -bottom-2">
            <Badge className="bg-white text-foreground" variant="outline">
              Nuevo
            </Badge>
          </div>
        )}
      </div>
      <div className="flex flex-col">
        <span>
          <span className="text-muted-foreground mr-1">#{profile.id}</span>
          <span className="font-semibold mr-1">{profile.displayName}</span>
          <span>({fullName})</span>
        </span>
        <span className="text-muted-foreground text-sm">{profile.email}</span>
        <div className="flex gap-1 my-2">
          {profile.userSocials
            .filter((social) => social.username)
            .map((social) => (
              <SocialMediaBadge
                key={social.id}
                socialMediaType={social.type}
                username={social.username}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
