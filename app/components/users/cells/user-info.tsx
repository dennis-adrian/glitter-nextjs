import { ProfileType } from "@/app/api/users/definitions";
import CopyToClipboardButton from "@/app/components/common/copy-to-clipboard-button";
import ProfileAvatar from "@/app/components/common/profile-avatar";
import SocialMediaBadge from "@/app/components/social-media-badge";

export default function UserInfoCell({
  profile: profile,
}: {
  profile: ProfileType;
}) {
  const fullName =
    `${profile.firstName || ""} ${profile.lastName || ""}` || "Sin nombre";
  return (
    <div className="flex gap-4 items-center">
      <ProfileAvatar profile={profile} />
      <div className="flex flex-col">
        <span>
          <span className="text-muted-foreground mr-1">#{profile.id}</span>
          <span className="font-semibold mr-1">{profile.displayName}</span>
          <span>({fullName})</span>
        </span>
        <span className="text-muted-foreground text-sm flex gap-1 items-center">
          {profile.email}
          <CopyToClipboardButton text={profile.email} iconOnly />
        </span>
        <span className="text-muted-foreground text-sm flex gap-1 items-center">
          +591 {profile.phoneNumber}
          <CopyToClipboardButton text={`591${profile.phoneNumber}`} iconOnly />
        </span>
        {/* TODO: Try to make this overflow */}
        <div className="flex gap-1 my-2">
          {profile.phoneNumber && (
            <SocialMediaBadge
              socialMediaType="whatsapp"
              username={profile.phoneNumber}
            />
          )}
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
