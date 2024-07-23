import { Badge } from "@/app/components/ui/badge";
import { Tag } from "@/app/lib/tags/definitions";
import { TagIcon } from "lucide-react";

type TagProps = {
  tag: Tag;
};
export default function TagBadge(props: TagProps) {
  return (
    <Badge className="font-normal" variant="outline">
      {props.tag.label}
      <TagIcon className="ml-1 h-4 w-4" />
    </Badge>
  );
}
