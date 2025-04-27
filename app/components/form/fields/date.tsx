import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import { DateTime } from "luxon";
import { InputHTMLAttributes } from "react";
import { UseFormReturn } from "react-hook-form";

export default function DateInput({
  bottomBorderOnly,
  formControl,
  label,
  name,
  messagePosition = "bottom",
  description,
  ...props
}: {
  bottomBorderOnly?: boolean;
  formControl: UseFormReturn<any>["control"];
  label?: string;
  messagePosition?: "top" | "bottom";
  name: string;
  description?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FormField
      control={formControl}
      name={name}
      render={({ field }) => {
        let value = field.value;
        if (value instanceof Date) {
          value = DateTime.fromJSDate(value, { zone: "local" }).toFormat(
            "yyyy-MM-dd",
          );
        }

        return (
          <FormItem className="w-full grid gap-2">
            {label && <FormLabel>{label}</FormLabel>}
            {messagePosition === "top" && <FormMessage />}
            <FormControl>
              <Input
                bottomBorderOnly={bottomBorderOnly}
                type="date"
                {...field}
                {...props}
                value={value}
              />
            </FormControl>
            {description && <FormDescription>{description}</FormDescription>}
            {messagePosition === "bottom" && <FormMessage />}
          </FormItem>
        );
      }}
    />
  );
}
