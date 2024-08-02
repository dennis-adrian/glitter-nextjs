"use client";

import NewSubcategoryModal from "@/app/components/subcategories/modals/new-subcategory-modal";
import { Button } from "@/app/components/ui/button";
import { useState } from "react";

export default function NewSubcategory() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Agregar subcategoría</Button>
      <NewSubcategoryModal open={open} setOpen={setOpen} />
    </>
  );
}
