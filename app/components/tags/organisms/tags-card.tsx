"use client";

import TagBadge from "@/app/components/tags/tag-badge";
import { Card, CardContent, CardHeader } from "@/app/components/ui/card";
import { Tag } from "@/app/lib/tags/definitions";

type TagsCardProps = {
  title: string;
  tags: Tag[];
};

export default function TagsCard(props: TagsCardProps) {
  function handleDeleteTag(tag: Tag) {
    console.log(tag);
  }

  return (
    <Card>
      <CardHeader>{props.title}</CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2">
          {props.tags.map((tag) => (
            <TagBadge
              canDelete
              key={tag.id}
              tag={tag}
              onDelete={handleDeleteTag}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
