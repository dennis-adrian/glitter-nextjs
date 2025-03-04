import { UserSocial } from "@/app/api/users/definitions";
import { Badge } from "@/app/components/ui/badge";
import { socialsIcons, socialsUrls } from "@/app/lib/users/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";

type SocialMediaBadgeProps = {
  socialMediaType: UserSocial["type"] | "whatsapp";
  username: string;
};

export default function SocialMediaBadge(props: SocialMediaBadgeProps) {
  return (
    <Badge className="max-w-fit font-normal" variant="outline">
      <Link
        className="flex items-center"
        href={`${socialsUrls[props.socialMediaType]}${props.username}`}
        target="_blank"
        rel="noreferrer"
      >
        <FontAwesomeIcon
          className="w-4 h-4 mr-1"
          icon={socialsIcons[props.socialMediaType]}
        />
        {props.username}
      </Link>
    </Badge>
  );
}
