"use client";

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import { InputHTMLAttributes } from "react";
import { UseFormReturn } from "react-hook-form";

export default function SocialMediaInput({
  formControl,
  label,
  name,
  ...props
}: {
  formControl: UseFormReturn<any>["control"];
  label: string;
  name: string;
  placeholder?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FormField
      control={formControl}
      name={name}
      render={({ field, formState, fieldState }) => {
        debugger;
        return (
          <FormItem className="grid gap-2">
            <FormLabel>{label}</FormLabel>
            <FormControl>
              <div className="relative flex items-center">
                <span className="absolute text-muted-foreground left-2">@</span>
                <Input className="pl-6" {...props} {...field} />
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
