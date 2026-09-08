"use client";
"use no memo";

import { CheckIcon, PlusCircleIcon } from "lucide-react";
import type { Table } from "@tanstack/react-table";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
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
                <Badge variant="secondary" size="sm" className="rounded-sm">
                  {selected.size} seleccionados
                </Badge>
              ) : (
                <span className="flex gap-1">
                  {options
                    .filter((option) => selected.has(option.value))
                    .map((option) => (
                      <Badge
                        key={option.value}
                        variant="secondary"
                        size="sm"
                        className="rounded-sm"
                      >
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
                    <div
                      className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible",
                      )}
                    >
                      <CheckIcon className="h-3 w-3" />
                    </div>
                    <span>{option.label}</span>
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
