import { ProfileTag, ProfileTagWithTag } from "@/app/api/users/definitions";
import { Badge } from "@/app/components/ui/badge";
import { TagIcon } from "lucide-react";

type ProfileTagProps = {
  profileTag: ProfileTagWithTag;
};
export default function ProfileTagBadge(props: ProfileTagProps) {
  const tag = props.profileTag.tag;
  return (
    <Badge className="font-normal" variant="outline">
      {tag.label}
      <TagIcon className="ml-1 h-4 w-4" />
    </Badge>
  );
}
