import { ProfileWithSocials } from "@/app/api/users/definitions";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/app/components/ui/card";
import { socialsIcons, socialsUrls } from "@/app/lib/config";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Image from "next/image";

export function ParticipantCard({ profile }: { profile: ProfileWithSocials }) {
  const socials = profile.userSocials.filter((social) => social.username);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{profile.displayName}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3">
        <div className="relative w-24 h-24 rounded-full bg-gray-200">
          <Image
            src={profile.imageUrl || "img/profile-avatar.png"}
            alt="Imagen de perfil"
            className="rounded-full object-cover absolute inset-0 w-full h-full"
            width={100}
            height={100}
            blurDataURL="img/profile-avatar.png"
          />
        </div>
        <div className="text-sm text-muted-foreground text-center">
          {profile.bio}
        </div>
        <div className="flex items-center justify-center gap-2">
          {socials.map((social) => {
            const url = socialsUrls[social.type];
            const icon = socialsIcons[social.type];
            return (
              <a
                key={social.id}
                href={`${url}${social.username}`}
                target="_blank"
                rel="noreferrer"
              >
                <FontAwesomeIcon className="h-6 w-6" icon={icon} />
              </a>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
