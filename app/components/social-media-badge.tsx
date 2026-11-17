import { UserSocial } from "@/app/api/users/definitions";
import DeleteSocialMediaForm from "@/app/components/delete-social-media-form";
import BrandIcon from "@/app/components/brand-icon";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { socialsUrls } from "@/app/lib/users/utils";
import { Trash2Icon } from "lucide-react";
import Link from "next/link";

type SocialMediaBadgeProps = {
  socialMediaType: UserSocial["type"] | "whatsapp";
  username: string;
  socialId?: number;
  canBeDeleted?: boolean;
};

export default function SocialMediaBadge(props: SocialMediaBadgeProps) {
  const formattedValue = props.username.startsWith("+")
    ? props.username.slice(1)
    : props.username;
  const url = `${socialsUrls[props.socialMediaType]}${formattedValue}`;

  return (
    <Badge className="max-w-fit font-normal" variant="outline">
      <Link
        className="flex items-center"
        href={url}
        target="_blank"
        rel="noreferrer"
      >
        <BrandIcon className="w-4 h-4 mr-1" brand={props.socialMediaType} />
        {formattedValue}
      </Link>
      {props.canBeDeleted && props.socialId && (
        <DeleteSocialMediaForm socialId={props.socialId} />
      )}
    </Badge>
  );
}
