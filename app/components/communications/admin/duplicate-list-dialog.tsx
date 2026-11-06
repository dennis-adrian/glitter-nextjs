"use client";

import { useRouter } from "next/navigation";
import { type TransitionStartFunction, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { duplicateDistributionListAction } from "@/app/lib/distribution_lists/actions";
import {
  DISTRIBUTION_LIST_NAME_MAX_LENGTH,
  defaultCopyName,
  type DistributionListSource,
} from "@/app/lib/distribution_lists/definitions";

/** What "Duplicar" copies: any audience, by its source and its name. */
export type DuplicableList = {
  source: DistributionListSource;
  name: string;
  /** Confirmados or a filter list: computed each time, so the copy remembers it. */
  dynamic: boolean;
};

export function duplicateExplanation({ name, dynamic }: DuplicableList) {
  return dynamic
    ? `Copiamos a quienes están hoy en «${name}» en una lista elegida a mano, que podés cambiar. Quienes entren después a «${name}» no se suman solos: los traés con «Traer nuevos».`
    : `Copiamos a las mismas personas de «${name}» en una lista nueva, elegida a mano.`;
}

/** The form, mounted each time the dialog opens, so the name starts fresh. */
function DuplicateListForm({
  list,
  isPending,
  startTransition,
  onOpenChange,
}: {
  list: DuplicableList;
  isPending: boolean;
  startTransition: TransitionStartFunction;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(() => defaultCopyName(list.name));

  function duplicate() {
    startTransition(async () => {
      try {
        const result = await duplicateDistributionListAction({
          source: list.source,
          name: name.trim(),
        });
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        toast.success(result.message);
        onOpenChange(false);
        router.push(`/dashboard/communications/lists/${result.listId}`);
      } catch (error) {
        console.error("Error duplicating a distribution list", error);
        toast.error("No se pudo copiar la lista. Intentá de nuevo.");
      }
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        duplicate();
      }}
    >
      <div className="space-y-2">
        <label htmlFor="copy-name" className="text-sm font-medium">
          Nombre de la copia
        </label>
        <Input
          id="copy-name"
          value={name}
          maxLength={DISTRIBUTION_LIST_NAME_MAX_LENGTH}
          onChange={(event) => setName(event.target.value)}
          disabled={isPending}
        />
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => onOpenChange(false)}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending || !name.trim()}>
          {isPending ? "Copiando…" : "Duplicar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function DuplicateListDialog({
  list,
  open,
  onOpenChange,
}: {
  list: DuplicableList | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !isPending && onOpenChange(next)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicar la lista</DialogTitle>
          <DialogDescription>
            {list ? duplicateExplanation(list) : null}
          </DialogDescription>
        </DialogHeader>
        {list && (
          <DuplicateListForm
            list={list}
            isPending={isPending}
            startTransition={startTransition}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
