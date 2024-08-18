"use client";

import * as React from "react";
import { CheckIcon, CirclePlusIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
import { Separator } from "@/app/components/ui/separator";

type ComboboxOption = {
  value: string;
  label: string;
};

type ComboboxProps = {
  defaultValue?: string[];
  label: string;
  name: string;
  options: ComboboxOption[];
  onSelect?: (name: string, options: string[]) => void;
};

export function MultipleSelectCombobox(props: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<ComboboxOption[]>(
    props.options.filter((option) =>
      props.defaultValue?.includes(option.value),
    ),
  );

  const handleSelect = (value: string) => {
    const option = props.options.find((option) => option.value === value);
    if (!option) return;

    let newSelected = [];
    if (selected.map((option) => option.value).includes(value)) {
      newSelected = selected.filter((option) => option.value !== value);
    } else {
      newSelected = [...selected, option];
    }
    setSelected(newSelected);
    if (props.onSelect)
      props.onSelect(
        props.name,
        newSelected.map((option) => option.value),
      );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          className="border-dashed"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          size="sm"
        >
          <CirclePlusIcon className="h-4 w-4 mr-1" />
          {props.label}
          {selected.length > 0 && (
            <>
              <Separator
                decorative
                orientation="vertical"
                className="mx-2 h-4"
              />
              <div className="space-x-1">
                {selected.map((option) => (
                  <span
                    key={option.value}
                    className="text-sm font-normal bg-primary-50 py-1 px-2 rounded-md"
                  >
                    {option.label}
                  </span>
                ))}
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandInput placeholder="Buscar..." className="h-9" />
          <CommandList>
            <CommandEmpty>Sin resultados</CommandEmpty>
            <CommandGroup>
              {props.options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={(currentValue) => handleSelect(currentValue)}
                >
                  {option.label}
                  <CheckIcon
                    className={cn(
                      "ml-auto h-4 w-4",
                      selected
                        .map((option) => option.value)
                        .includes(option.value)
                        ? "opacity-100"
                        : "opacity-0",
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
