"use client";

import SubcategoriesDescription from "@/app/components/festivals/subcategories/sucategores-description";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SubcategoriesModalProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
};
export default function SubcategoriesModal(props: SubcategoriesModalProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.setOpen}>
      <DialogContent className="max-h-full overflow-auto">
        <DialogHeader>
          <DialogTitle>Categorías Glitter</DialogTitle>
        </DialogHeader>
        <SubcategoriesDescription className="flex flex-col gap-2" />
      </DialogContent>
    </Dialog>
  );
}
