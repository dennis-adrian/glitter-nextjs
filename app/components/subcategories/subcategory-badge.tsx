"use client";

import { Badge } from "@/app/components/ui/badge";
import { Subcategory } from "@/app/lib/subcategories/definitions";
import { BoxIcon, XIcon } from "lucide-react";

type SubcategoryProps = {
  canDelete?: boolean;
  subcategory: Subcategory;
  onDelete?: (tag: Subcategory) => void;
};

export default function SubcategoryBadge(props: SubcategoryProps) {
  return (
    <Badge className="font-normal max-w-fit" variant="outline">
      {props.canDelete && props.onDelete ? (
        <span className="cursor-pointer mr-1">
          <XIcon
            onClick={() => props.onDelete!(props.subcategory)}
            className="h-4 w-4"
          />
        </span>
      ) : null}
      {props.subcategory.label}
      {!props.canDelete && <BoxIcon className="ml-1 h-3 w-3" />}
    </Badge>
  );
}
