"use client";

import { ArchiveIcon } from "lucide-react";
import { useState } from "react";

import ArchiveListDialog from "@/app/components/communications/admin/archive-list-dialog";
import { Button } from "@/app/components/ui/button";

export default function ListArchiveButton({
  list,
}: {
  list: { id: number; name: string };
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <ArchiveIcon className="mr-2 h-4 w-4" aria-hidden />
        Archivar
      </Button>
      <ArchiveListDialog
        list={list}
        open={open}
        onOpenChange={setOpen}
        afterArchive="/dashboard/communications/lists"
      />
    </>
  );
}
