"use client";

import DeleteSubcategoryModal from "@/app/components/subcategories/modals/delete-modal";
import SubcategoryBadge from "@/app/components/subcategories/subcategory-badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Subcategory } from "@/app/lib/subcategories/definitions";
import { useState } from "react";

type SubcategoriesCardProps = {
  title: string;
  subcategories: Subcategory[];
};

export default function SubcategoriesCard(props: SubcategoriesCardProps) {
  const [selectedCategory, setSelectedSubcategory] = useState<
    Subcategory | undefined
  >();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  function handleDeleteTag(subcategory: Subcategory) {
    setSelectedSubcategory(subcategory);
    setShowDeleteModal(true);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{props.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            {props.subcategories.map((subcategory) => (
              <SubcategoryBadge
                canDelete
                key={subcategory.id}
                subcategory={subcategory}
                onDelete={handleDeleteTag}
              />
            ))}
          </div>
        </CardContent>
      </Card>
      <DeleteSubcategoryModal
        show={showDeleteModal}
        subcategory={selectedCategory!}
        onOpenChange={setShowDeleteModal}
      />
    </>
  );
}
