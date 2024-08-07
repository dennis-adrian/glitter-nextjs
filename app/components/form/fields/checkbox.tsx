"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, UseFormReturn } from "react-hook-form";
import { z } from "zod";

import { Checkbox } from "@/components/ui/checkbox";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
type CheckboxInputProps = {
  description?: string;
  formControl: UseFormReturn<any>["control"];
  items: {
    id: string;
    label: string;
  }[];
  label?: string;
  name: string;
};
export default function CheckboxInput({
  description,
  formControl,
  items,
  label,
  name,
}: CheckboxInputProps) {
  return (
    <FormField
      control={formControl}
      name={name}
      render={() => (
        <FormItem>
          <div className="mb-4">
            {label && <FormLabel>{label}</FormLabel>}
            {description && (
              <FormDescription className="text-xs">
                {description}
              </FormDescription>
            )}
          </div>
          <div className="flex flex-col gap-1">
            {items.map((item) => (
              <FormField
                key={item.id}
                control={formControl}
                name={name}
                render={({ field }) => {
                  return (
                    <FormItem
                      key={item.id}
                      className="flex flex-row items-start space-x-3 space-y-0"
                    >
                      <FormControl>
                        <Checkbox
                          checked={field.value?.includes(item.id)}
                          onCheckedChange={(checked) => {
                            return checked
                              ? field.onChange([...field.value, item.id])
                              : field.onChange(
                                  field.value?.filter(
                                    (value: string) => value !== item.id,
                                  ),
                                );
                          }}
                        />
                      </FormControl>
                      <FormLabel className="font-normal">
                        {item.label}
                      </FormLabel>
                    </FormItem>
                  );
                }}
              />
            ))}
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
