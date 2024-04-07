import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { Textarea } from "@/app/components/ui/textarea";
import { UseFormReturn } from "react-hook-form";

export default function TextareaInput({
  formControl,
  label,
  maxLength,
  name,
  placeholder,
}: {
  formControl: UseFormReturn<any>["control"];
  label: string;
  maxLength?: number;
  name: string;
  placeholder: string;
}) {
  return (
    <FormField
      control={formControl}
      name={name}
      render={({ field }) => (
        <FormItem className="grid gap-2">
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Textarea
              className="resize-none"
              maxLength={maxLength || 80}
              placeholder={placeholder}
              {...field}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
