"use client";

import PublicCategories from "@/app/components/categories/public-categories";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PublicCategory } from "@/app/lib/categories/definitions";

type SubcategoriesModalProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  categories: PublicCategory[];
};

export default function SubcategoriesModal(props: SubcategoriesModalProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.setOpen}>
      <DialogContent className="max-h-full overflow-auto">
        <DialogHeader>
          <DialogTitle>Categorías Glitter</DialogTitle>
        </DialogHeader>
        <PublicCategories categories={props.categories} />
      </DialogContent>
    </Dialog>
  );
}
