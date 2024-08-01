"use client";

import DeleteTagModal from "@/app/components/tags/modals/delete-modal";
import TagBadge from "@/app/components/tags/tag-badge";
import { Card, CardContent, CardHeader } from "@/app/components/ui/card";
import { Tag } from "@/app/lib/tags/definitions";
import { useState } from "react";

type TagsCardProps = {
  title: string;
  tags: Tag[];
};

export default function TagsCard(props: TagsCardProps) {
  const [selectedTag, setSelectedTag] = useState<Tag | undefined>();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  function handleDeleteTag(tag: Tag) {
    setSelectedTag(tag);
    setShowDeleteModal(true);
  }

  return (
    <>
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
      <DeleteTagModal
        show={showDeleteModal}
        tag={selectedTag!}
        onOpenChange={setShowDeleteModal}
      />
    </>
  );
}
