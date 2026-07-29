"use client";

import { CheckIcon, ChevronsUpDownIcon, PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { FieldValues, Path, UseFormReturn } from "react-hook-form";

import { Button } from "@/app/components/ui/button";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
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

type Props<T extends FieldValues> = {
  form: UseFormReturn<T>;
  name: Path<T>;
  /** Values already in use, so the same one gets reused instead of retyped. */
  options: string[];
  label?: string;
  description?: string;
  placeholder?: string;
  /** Shown in the create row, e.g. `Crear «Negocio y precios»`. */
  createLabel?: (value: string) => string;
  emptyLabel?: string;
};

/**
 * A combobox over free-text values that also lets you add one that does not
 * exist yet — the Jira labels pattern.
 *
 * The point is convergence: showing what other records already use is what
 * makes separate records land on the same value, which a bare text input can
 * never do. The stored value is still plain text, so no vocabulary table is
 * needed until one is actually wanted.
 */
export default function CreatableComboboxInput<T extends FieldValues>({
  form,
  name,
  options,
  label,
  description,
  placeholder = "Elegir o crear...",
  createLabel = (value) => `Crear «${value}»`,
  emptyLabel = "Escribe para crear el primero.",
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const trimmedQuery = query.trim();
  const alreadyExists = options.some(
    (option) => option.toLowerCase() === trimmedQuery.toLowerCase(),
  );
  const canCreate = trimmedQuery.length > 0 && !alreadyExists;

  function commit(value: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    form.setValue(name, (value || null) as any, { shouldDirty: true });
    setQuery("");
    setOpen(false);
  }

  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => {
        const current = typeof field.value === "string" ? field.value : "";

        return (
          <FormItem className="flex w-full flex-col gap-2">
            {label && <FormLabel>{label}</FormLabel>}
            <div className="flex items-center gap-2">
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      className={cn(
                        "w-full justify-between",
                        !current && "text-muted-foreground",
                      )}
                    >
                      {current || placeholder}
                      <ChevronsUpDownIcon className="opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent
                  className="w-(--radix-popover-trigger-width) p-0"
                  align="start"
                >
                  <Command>
                    <CommandInput
                      placeholder="Buscar o escribir uno nuevo..."
                      className="h-9"
                      value={query}
                      onValueChange={setQuery}
                    />
                    <CommandList>
                      {!canCreate && <CommandEmpty>{emptyLabel}</CommandEmpty>}
                      {canCreate && (
                        <CommandGroup>
                          <CommandItem
                            value={trimmedQuery}
                            onSelect={() => commit(trimmedQuery)}
                          >
                            <PlusIcon className="mr-2 h-4 w-4" />
                            {createLabel(trimmedQuery)}
                          </CommandItem>
                        </CommandGroup>
                      )}
                      {options.length > 0 && (
                        <CommandGroup heading="Ya en uso">
                          {options.map((option) => (
                            <CommandItem
                              key={option}
                              value={option}
                              onSelect={() => commit(option)}
                            >
                              {option}
                              <CheckIcon
                                className={cn(
                                  "ml-auto",
                                  option === current
                                    ? "opacity-100"
                                    : "opacity-0",
                                )}
                              />
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {current ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Quitar"
                  onClick={() => commit("")}
                >
                  <XIcon className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
