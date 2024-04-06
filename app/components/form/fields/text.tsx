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

export default function TextInput({
  formControl,
  label,
  name,
  ...props
}: {
  formControl: UseFormReturn["control"];
  label: string;
  name: string;
  placeholder?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FormField
      control={formControl}
      name={name}
      render={({ field }) => (
        <FormItem className="grid gap-2">
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...field} {...props} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
