"use client";

import { CheckIcon, CirclePlusIcon, XIcon } from "lucide-react";
import { useState } from "react";

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
import { cn } from "@/app/lib/utils";

export type ListMultiSelectOption = {
  value: string;
  label: string;
  /** Options with the same group are listed under it, in order. */
  group?: string;
};

/**
 * Pick several values from a searchable list; each pick shows below as a
 * chip that removes it. Searches the labels, not the values, which are ids.
 */
export default function ListMultiSelect({
  id,
  label,
  hint,
  placeholder,
  options,
  selected,
  onChange,
  disabled = false,
}: {
  id: string;
  label: string;
  hint?: string;
  placeholder: string;
  options: ListMultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedSet = new Set(selected);
  const byValue = new Map(options.map((option) => [option.value, option]));
  const groups: {
    name: string | undefined;
    options: ListMultiSelectOption[];
  }[] = [];
  for (const option of options) {
    const last = groups.at(-1);
    if (last && last.name === option.group) last.options.push(option);
    else groups.push({ name: option.group, options: [option] });
  }

  function toggle(value: string) {
    onChange(
      selectedSet.has(value)
        ? selected.filter((current) => current !== value)
        : [...selected, value],
    );
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium" id={`${id}-label`}>
          {label}
        </p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-dashed"
            disabled={disabled}
            aria-describedby={`${id}-label`}
            aria-expanded={open}
          >
            <CirclePlusIcon className="mr-1 h-4 w-4" aria-hidden />
            {placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar…" className="h-9" />
            <CommandList>
              <CommandEmpty>Sin resultados</CommandEmpty>
              {groups.map((group, index) => (
                <CommandGroup key={group.name ?? index} heading={group.name}>
                  {group.options.map((option) => (
                    <CommandItem
                      key={option.value}
                      // cmdk filters on `value`; the label keeps it searchable
                      // and the id keeps two same-named options apart.
                      value={`${option.label} ${option.group ?? ""} #${option.value}`}
                      onSelect={() => toggle(option.value)}
                    >
                      {option.label}
                      <CheckIcon
                        className={cn(
                          "ml-auto h-4 w-4",
                          selectedSet.has(option.value)
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={`${label}: elegidos`}>
          {selected.map((value) => {
            const option = byValue.get(value);
            const text = option
              ? option.group
                ? `${option.label} (${option.group})`
                : option.label
              : `#${value}`;
            return (
              <li
                key={value}
                className="flex max-w-full items-center gap-1 rounded-full border bg-background py-0.5 pl-3 pr-1 text-sm"
              >
                <span className="truncate">{text}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-full"
                  disabled={disabled}
                  onClick={() => toggle(value)}
                  aria-label={`Quitar ${text}`}
                >
                  <XIcon className="h-3.5 w-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
