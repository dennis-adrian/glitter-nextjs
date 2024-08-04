"use client";

import SubcategoriesDescription from "@/app/components/festivals/subcategories/sucategores-description";
import BaseModal from "@/app/components/modals/base-modal";

type SubcategoriesModalProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
};
export default function SubcategoriesModal(props: SubcategoriesModalProps) {
  return (
    <BaseModal
      title="Categorías Glitter"
      show={props.open}
      onOpenChange={props.setOpen}
    >
      <SubcategoriesDescription className="flex flex-col gap-2" />
    </BaseModal>
  );
}
