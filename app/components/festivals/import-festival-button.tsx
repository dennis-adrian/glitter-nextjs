"use client";

import { useState } from "react";
import { UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import FestivalImportDialog from "@/app/components/festivals/festival-import-dialog";

export default function ImportFestivalButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        className="flex-1 sm:flex-none"
        onClick={() => setOpen(true)}
      >
        <UploadIcon className="mr-2 h-4 w-4" />
        Importar
      </Button>
      <FestivalImportDialog open={open} onOpenChange={setOpen} mode="create" />
    </>
  );
}
