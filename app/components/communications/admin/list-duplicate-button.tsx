"use client";

import { CopyIcon } from "lucide-react";
import { useState } from "react";

import DuplicateListDialog, {
  type DuplicableList,
} from "@/app/components/communications/admin/duplicate-list-dialog";
import { Button } from "@/app/components/ui/button";

export default function ListDuplicateButton({
  list,
  size,
}: {
  list: DuplicableList;
  size?: "sm";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        onClick={() => setOpen(true)}
        aria-label={`Duplicar ${list.name}`}
      >
        <CopyIcon className="mr-2 h-4 w-4" aria-hidden />
        Duplicar
      </Button>
      <DuplicateListDialog list={list} open={open} onOpenChange={setOpen} />
    </>
  );
}
