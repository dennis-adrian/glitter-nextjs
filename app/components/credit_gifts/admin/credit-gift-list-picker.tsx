"use client";

import { ListPlusIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/app/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/ui/popover";
import { expandListForCreditGiftAction } from "@/app/lib/credit_gifts/actions";
import {
  CREDIT_GIFT_LISTS_STAGING_REASON,
  CREDIT_GIFT_MAX_RECIPIENTS,
  type CreditGiftListsAvailability,
  type CreditGiftRecipientOption,
} from "@/app/lib/credit_gifts/definitions";
import {
  audienceCountLine,
  confirmadosListName,
  type DistributionListSource,
  type DistributionListSummary,
  type FestivalListSummary,
} from "@/app/lib/distribution_lists/definitions";

export type CreditGiftListOptions = {
  availability: CreditGiftListsAvailability;
  festivals: FestivalListSummary[];
  saved: DistributionListSummary[];
};

type CreditGiftListPickerProps = {
  lists: CreditGiftListOptions;
  recipients: CreditGiftRecipientOption[];
  onAddMany: (recipients: CreditGiftRecipientOption[]) => void;
  disabled?: boolean;
};

/**
 * "Agregar una lista" (docs/IMPLEMENTATION-comunicados.md B9): a festival's
 * or a saved list's participants, added as people. The server refuses the
 * whole list when the gift would pass the cap; nothing is truncated.
 */
export default function CreditGiftListPicker({
  lists,
  recipients,
  onAddMany,
  disabled = false,
}: CreditGiftListPickerProps) {
  const [open, setOpen] = useState(false);
  const [isExpanding, startExpanding] = useTransition();

  if (lists.availability === "hidden") return null;

  if (lists.availability === "staging") {
    return (
      <div className="space-y-1 sm:max-w-56">
        <Button type="button" variant="outline" disabled className="w-full">
          <ListPlusIcon className="mr-2 h-4 w-4" aria-hidden />
          Agregar una lista
        </Button>
        <p className="text-xs text-muted-foreground">
          {CREDIT_GIFT_LISTS_STAGING_REASON}
        </p>
      </div>
    );
  }

  function expand(source: DistributionListSource) {
    setOpen(false);
    startExpanding(async () => {
      try {
        const result = await expandListForCreditGiftAction({
          source,
          chosenIds: recipients.map((recipient) => recipient.id),
        });
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        // The pickers are disabled meanwhile, so `recipients` is still who
        // the server counted; this only guards against a double add.
        const chosen = new Set(recipients.map((recipient) => recipient.id));
        const fresh = result.recipients.filter(
          (recipient) => !chosen.has(recipient.id),
        );
        if (recipients.length + fresh.length > CREDIT_GIFT_MAX_RECIPIENTS) {
          toast.error(
            `Un regalo llega a ${CREDIT_GIFT_MAX_RECIPIENTS} personas como máximo.`,
          );
          return;
        }
        if (fresh.length > 0) onAddMany(fresh);
        toast.success(result.message);
      } catch (error) {
        console.error("Error adding a list to a credit gift", error);
        toast.error("No se pudo agregar la lista. Intentá de nuevo.");
      }
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || isExpanding}
          aria-expanded={open}
        >
          <ListPlusIcon className="mr-2 h-4 w-4" aria-hidden />
          {isExpanding ? "Agregando…" : "Agregar una lista"}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(24rem,calc(100vw-2rem))] p-0"
        align="end"
      >
        <Command>
          <CommandInput placeholder="Buscar una lista…" />
          <CommandList>
            <CommandEmpty>No hay listas con ese nombre.</CommandEmpty>
            {lists.festivals.length > 0 && (
              <CommandGroup heading="Confirmados por festival">
                {lists.festivals.map((festival) => {
                  const name = confirmadosListName(festival.festivalName);
                  return (
                    <CommandItem
                      key={`festival-${festival.festivalId}`}
                      value={`festival-${festival.festivalId}`}
                      keywords={[name]}
                      onSelect={() =>
                        expand({
                          kind: "festival",
                          festivalId: festival.festivalId,
                        })
                      }
                    >
                      <ListOption
                        name={name}
                        detail={audienceCountLine(festival.count)}
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
            {lists.saved.length > 0 && (
              <CommandGroup heading="Listas guardadas">
                {lists.saved.map((list) => (
                  <CommandItem
                    key={`list-${list.id}`}
                    value={`list-${list.id}`}
                    keywords={[list.name]}
                    disabled={list.count === null}
                    onSelect={() => expand({ kind: "list", listId: list.id })}
                  >
                    <ListOption
                      name={list.name}
                      detail={
                        list.count
                          ? audienceCountLine(list.count)
                          : "El filtro ya no se puede leer: editá la lista."
                      }
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ListOption({ name, detail }: { name: string; detail: string }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate">{name}</span>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </span>
  );
}
