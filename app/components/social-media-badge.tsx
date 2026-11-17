import { UserSocial } from "@/app/api/users/definitions";
import DeleteSocialMediaForm from "@/app/components/delete-social-media-form";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { socialsIcons, socialsUrls } from "@/app/lib/users/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Trash2Icon } from "lucide-react";
import Link from "next/link";

type SocialMediaBadgeProps = {
  socialMediaType: UserSocial["type"] | "whatsapp";
  username: string;
  socialId?: number;
  canBeDeleted?: boolean;
  /**
   * Let a long username wrap instead of setting its container's minimum
   * width. Off in table cells, where an auto column would break it letter
   * by letter.
   */
  wrap?: boolean;
};

export default function SocialMediaBadge(props: SocialMediaBadgeProps) {
  const formattedValue = props.username.startsWith("+")
    ? props.username.slice(1)
    : props.username;
  const url = `${socialsUrls[props.socialMediaType]}${formattedValue}`;

  return (
    <Badge
      className={
        props.wrap
          ? "min-w-0 max-w-full shrink whitespace-normal font-normal"
          : "max-w-fit font-normal"
      }
      variant="outline"
    >
      <Link
        className={
          props.wrap ? "flex min-w-0 items-center" : "flex items-center"
        }
        href={url}
        target="_blank"
        rel="noreferrer"
      >
        <FontAwesomeIcon
          className="w-4 h-4 mr-1 shrink-0"
          icon={socialsIcons[props.socialMediaType]}
        />
        {props.wrap ? (
          <span className="min-w-0 wrap-anywhere">{formattedValue}</span>
        ) : (
          formattedValue
        )}
      </Link>
      {props.canBeDeleted && props.socialId && (
        <DeleteSocialMediaForm socialId={props.socialId} />
      )}
    </Badge>
  );
}
