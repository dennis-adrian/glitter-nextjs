"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { archiveDistributionListAction } from "@/app/lib/distribution_lists/actions";
import { archiveDistributionListPrompt } from "@/app/lib/distribution_lists/definitions";

export default function ArchiveListDialog({
  list,
  open,
  onOpenChange,
  afterArchive,
}: {
  list: { id: number; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where to go once archived; stays on the page when unset. */
  afterArchive?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function archive() {
    if (!list) return;
    startTransition(async () => {
      try {
        const result = await archiveDistributionListAction(list.id);
        if (result.success) toast.success(result.message);
        else toast.error(result.message);
        onOpenChange(false);
        if (result.success && afterArchive) router.push(afterArchive);
        else router.refresh();
      } catch (error) {
        console.error("Error archiving a distribution list", error);
        toast.error("No se pudo archivar la lista. Intentá de nuevo.");
      }
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => !isPending && onOpenChange(next)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archivar la lista</AlertDialogTitle>
          <AlertDialogDescription>
            {list ? archiveDistributionListPrompt(list.name) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending || !list}
            onClick={(event) => {
              event.preventDefault();
              archive();
            }}
          >
            {isPending ? "Archivando…" : "Archivar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
