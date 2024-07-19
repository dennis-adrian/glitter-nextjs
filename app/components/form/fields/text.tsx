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
  bottomBorderOnly,
  formControl,
  label,
  name,
  messagePosition = "bottom",
  ...props
}: {
  bottomBorderOnly?: boolean;
  formControl: UseFormReturn<any>["control"];
  label?: string;
  messagePosition?: "top" | "bottom";
  name: string;
  placeholder?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FormField
      control={formControl}
      name={name}
      render={({ field }) => (
        <FormItem className="w-full grid gap-2">
          {label && <FormLabel>{label}</FormLabel>}
          {messagePosition === "top" && <FormMessage />}
          <FormControl>
            <Input bottomBorderOnly={bottomBorderOnly} {...field} {...props} />
          </FormControl>
          {messagePosition === "bottom" && <FormMessage />}
        </FormItem>
      )}
    />
  );
}
