"use client";

import { Badge } from "@/app/components/ui/badge";
import { Tag } from "@/app/lib/tags/definitions";
import { TagIcon, XIcon } from "lucide-react";

type TagProps = {
  canDelete?: boolean;
  tag: Tag;
  onDelete?: (tag: Tag) => void;
};

export default function TagBadge(props: TagProps) {
  return (
    <Badge className="font-normal max-w-fit" variant="outline">
      {props.canDelete && props.onDelete ? (
        <span className="cursor-pointer mr-1">
          <XIcon
            onClick={() => props.onDelete!(props.tag)}
            className="h-4 w-4"
          />
        </span>
      ) : null}
      {props.tag.label}
      {!props.canDelete && <TagIcon className="ml-1 h-3 w-3" />}
    </Badge>
  );
}
