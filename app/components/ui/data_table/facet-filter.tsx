"use client";
"use no memo";

import { PlusCircleIcon } from "lucide-react";
import type { Table } from "@tanstack/react-table";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/app/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/ui/popover";
import { Separator } from "@/app/components/ui/separator";
import { cn } from "@/app/lib/utils";

/** Above this many options, hunting beats reading and the list gets a search box. */
const SEARCHABLE_THRESHOLD = 7;

/** Selected values shown in full on the trigger before it collapses to a count. */
const MAX_INLINE_BADGES = 2;

export type FilterOption = { value: string; label: string };

type DataTableFacetFilterProps<TData> = {
  columnId: string;
  label: string;
  options: FilterOption[];
  table: Table<TData>;
};

export function selectedValuesFor<TData>(
  table: Table<TData>,
  columnId: string,
): string[] {
  const filter = table
    .getState()
    .columnFilters.find((entry) => entry.id === columnId);
  if (!filter) return [];
  if (Array.isArray(filter.value)) return filter.value as string[];
  // Some columns filter on a single value rather than a list.
  return filter.value == null || filter.value === ""
    ? []
    : [String(filter.value)];
}

/**
 * One filter group, in its own popover.
 *
 * Every group used to share a single dropdown, so a table with three of them
 * — reservation status, coverage, category — put twenty-odd options in one
 * scrolling list under a button labelled only "Filtros". Nothing on screen
 * said which were active, and there was no way to clear one.
 */
export function DataTableFacetFilter<TData>({
  columnId,
  label,
  options,
  table,
}: DataTableFacetFilterProps<TData>) {
  const selected = new Set(selectedValuesFor(table, columnId));
  const isSearchable = options.length > SEARCHABLE_THRESHOLD;

  function toggle(value: string) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);

    table.setColumnFilters((state) => {
      const others = state.filter((entry) => entry.id !== columnId);
      // An empty selection means "no filter", not "match nothing" — leaving an
      // empty array behind reads as an active filter on the trigger.
      if (next.size === 0) return others;
      return [...others, { id: columnId, value: [...next] }];
    });
  }

  function clear() {
    table.setColumnFilters((state) =>
      state.filter((entry) => entry.id !== columnId),
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 rounded-full border-dashed px-3 text-xs",
            selected.size > 0 && "border-solid border-primary/40",
          )}
        >
          <PlusCircleIcon className="mr-2 h-3.5 w-3.5 shrink-0" />
          {label}
          {selected.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-2 h-4" />
              {selected.size > MAX_INLINE_BADGES ? (
                <Badge variant="secondary" size="sm">
                  {selected.size} seleccionados
                </Badge>
              ) : (
                <span className="flex gap-1">
                  {options
                    .filter((option) => selected.has(option.value))
                    .map((option) => (
                      <Badge key={option.value} variant="secondary" size="sm">
                        {option.label}
                      </Badge>
                    ))}
                </span>
              )}
            </>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          {isSearchable && <CommandInput placeholder={label} className="h-9" />}
          <CommandList>
            <CommandEmpty>Sin resultados</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.has(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => toggle(option.value)}
                  >
                    {/* The real atom rather than a look-alike: a hand-rolled
                        box here used rounded-sm, which this project resolves to
                        8px — half of a 16px box, so it rendered as a circle. */}
                    <Checkbox
                      checked={isSelected}
                      tabIndex={-1}
                      aria-hidden
                      className="mr-2 pointer-events-none"
                    />
                    <span>{option.label}</span>
                    {/* The box is the only thing that says whether this option
                        is on, and it is aria-hidden — so checked state reached
                        sighted users alone. Said in text instead of through the
                        item's own aria-selected, which cmdk owns and uses for
                        the highlighted row: setting it here would announce
                        every filter as chosen the moment it was arrowed onto. */}
                    <span className="sr-only">
                      {isSelected ? "seleccionado" : "no seleccionado"}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selected.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={clear}
                    className="justify-center text-center text-xs"
                  >
                    Quitar filtro
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
