"use client";

import { CheckIcon, ListPlusIcon } from "lucide-react";
import { useState } from "react";

import ListKindIcon from "@/app/components/comunicados/admin/composer/list-kind-icon";
import type {
  ComposerFestivalOption,
  ComposerListOption,
} from "@/app/components/comunicados/admin/composer/types";
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
import {
  confirmadosListName,
  formatAudienceCount,
} from "@/app/lib/distribution_lists/definitions";

type ListSourcePickerProps = {
  festivals: ComposerFestivalOption[];
  lists: ComposerListOption[];
  chosen: { festivals: readonly number[]; lists: readonly number[] };
  /** Why no other list can be added now, e.g. the source limit. */
  fullReason: string | null;
  onPickFestival: (festivalId: number) => void;
  onPickList: (listId: number) => void;
  disabled?: boolean;
};

/**
 * "Agregar una lista" (docs/IMPLEMENTATION-comunicados.md G4): every
 * festival's "Confirmados", newest first, and the saved lists, each with who
 * can receive it today. A list joins the audience as a source; who is on it
 * is decided when the comunicado is sent.
 */
export default function ListSourcePicker({
  festivals,
  lists,
  chosen,
  fullReason,
  onPickFestival,
  onPickList,
  disabled = false,
}: ListSourcePickerProps) {
  const [open, setOpen] = useState(false);
  const chosenFestivals = new Set(chosen.festivals);
  const chosenLists = new Set(chosen.lists);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-expanded={open}
        >
          <ListPlusIcon className="mr-2 h-4 w-4" aria-hidden />
          Agregar una lista
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(26rem,calc(100vw-2rem))] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Buscar una lista…" />
          {fullReason && (
            <p className="border-b px-3 py-2 text-xs text-muted-foreground">
              {fullReason}
            </p>
          )}
          <CommandList>
            <CommandEmpty>No hay listas con ese nombre.</CommandEmpty>
            {festivals.length > 0 && (
              <CommandGroup heading="Confirmados por festival">
                {festivals.map((festival) => {
                  const name = confirmadosListName(festival.name);
                  const added = chosenFestivals.has(festival.festivalId);
                  return (
                    <CommandItem
                      key={`festival-${festival.festivalId}`}
                      value={`festival-${festival.festivalId}`}
                      keywords={[name]}
                      disabled={added || fullReason !== null}
                      onSelect={() => {
                        setOpen(false);
                        onPickFestival(festival.festivalId);
                      }}
                    >
                      <SourceOption
                        name={name}
                        count={festival.count.eligible}
                        added={added}
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
            {lists.length > 0 && (
              <CommandGroup heading="Listas guardadas">
                {lists.map((list) => {
                  const added = chosenLists.has(list.id);
                  return (
                    <CommandItem
                      key={`list-${list.id}`}
                      value={`list-${list.id}`}
                      keywords={[list.name]}
                      className="gap-2"
                      disabled={
                        added || list.count === null || fullReason !== null
                      }
                      onSelect={() => {
                        setOpen(false);
                        onPickList(list.id);
                      }}
                    >
                      <ListKindIcon kind={list.kind} />
                      <SourceOption
                        name={list.name}
                        count={list.count?.eligible ?? null}
                        added={added}
                        problem={
                          list.count === null
                            ? "El filtro ya no se puede leer: editá la lista."
                            : null
                        }
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** "Confirmados · Glitter Navidad 2026 · 312". */
function SourceOption({
  name,
  count,
  added,
  problem = null,
}: {
  name: string;
  count: number | null;
  added: boolean;
  problem?: string | null;
}) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">
          {name}
          {count !== null && (
            <span className="text-muted-foreground tabular-nums">
              {" "}
              · {formatAudienceCount(count)}
            </span>
          )}
        </span>
        {(problem || added) && (
          <span className="text-xs text-muted-foreground">
            {problem ?? "Ya está en los destinatarios"}
          </span>
        )}
      </span>
      {added && (
        <CheckIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      )}
    </span>
  );
}
