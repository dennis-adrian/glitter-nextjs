"use client";

import * as React from "react";
import { LucideIcon } from "lucide-react";

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

type Status = {
  value: string;
  label: string;
  icon?: LucideIcon;
};

type ComboboxPopoverProps = {
  defaultValue?: string;
  label: string;
  placeholder: string;
  name: string;
  options: Status[];
  onSelect?: (name: string, values: string[]) => void;
};
export function ComboboxPopover(props: ComboboxPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<string>(
    props.defaultValue || "",
  );

  let selectedOption;
  if (selected)
    selectedOption = props.options.find((option) => option.value === selected);

  const handleSelect = (value: string) => {
    setSelected(value);
    setOpen(false);
    if (props.onSelect) props.onSelect(props.name, [value]);
  };

  return (
    <div className="flex items-center gap-2">
      <p className="text-sm text-muted-foreground">{props.label}</p>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="">
            {selectedOption ? (
              <>
                {selectedOption.icon && (
                  <selectedOption.icon className="mr-1 h-4 w-4 shrink-0" />
                )}
                {selectedOption.label}
              </>
            ) : (
              <span>{props.placeholder}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0" side="right" align="start">
          <Command>
            <CommandInput placeholder="Buscar..." />
            <CommandList>
              <CommandEmpty>No se encontraron resultados.</CommandEmpty>
              <CommandGroup>
                {props.options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={handleSelect}
                  >
                    {option.icon && (
                      <option.icon
                        className={cn(
                          "mr-2 h-4 w-4",
                          option.value === selected
                            ? "opacity-100"
                            : "opacity-40",
                        )}
                      />
                    )}
                    <span>{option.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
