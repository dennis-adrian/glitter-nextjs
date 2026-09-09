"use client";

import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type SearchableSelectOption = {
  value: string;
  label: string;
  /** Listed but unpickable. Callers use it to show why, instead of hiding it. */
  disabled?: boolean;
};

/**
 * A select you can type into.
 *
 * The same Command/Popover pairing `ComboboxInput` uses, minus react-hook-form,
 * so a control holding its own state can have one. Worth the second component
 * rather than adopting a form just for one field: a plain dropdown stops being
 * usable somewhere around a few dozen entries, and a festival can have two
 * hundred stands.
 *
 * Filtering matches the option's whole label, so anything the caller puts in it
 * — a number, a sector, a category, a price — is searchable without a separate
 * keyword list to keep in step.
 */
export default function SearchableSelect({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  searchPlaceholder = "Buscar...",
  emptyLabel = "Sin resultados.",
  disabled,
}: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Controlled so closing can clear it. The popover keeps its content mounted,
  // so an uncontrolled input holds the last query: reopening would show a list
  // silently filtered by something the admin typed minutes ago and cannot see
  // any reason for.
  const [search, setSearch] = useState("");
  const selected = options.find((option) => option.value === value);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground",
          )}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={searchPlaceholder}
            className="h-9"
          />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  disabled={option.disabled}
                  onSelect={() => {
                    if (option.disabled) return;
                    onValueChange(option.value);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <span className="flex-1">{option.label}</span>
                  <CheckIcon
                    className={cn(
                      "ml-auto size-4",
                      option.value === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
