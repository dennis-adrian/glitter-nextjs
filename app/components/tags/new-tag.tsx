"use client";

import NewTagModal from "@/app/components/tags/forms/new-tag-modal";
import { Button } from "@/app/components/ui/button";
import { useState } from "react";

export default function NewTag() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Agregar etiqueta</Button>
      <NewTagModal open={open} setOpen={setOpen} />
    </>
  );
}
