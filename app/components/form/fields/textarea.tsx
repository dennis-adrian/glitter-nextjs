import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { Textarea } from "@/app/components/ui/textarea";
import { UseFormReturn } from "react-hook-form";

/** Callers whose schema allows less must pass their own `maxLength`. */
const DEFAULT_MAX_LENGTH = 2000;

export default function TextareaInput({
  formControl,
  label,
  maxLength,
  name,
  placeholder,
  required,
}: {
  formControl: UseFormReturn<any>["control"];
  label: string;
  maxLength?: number;
  name: string;
  placeholder: string;
  required?: boolean;
}) {
  return (
    <FormField
      control={formControl}
      name={name}
      render={({ field }) => (
        <FormItem className="grid gap-2">
          <FormLabel>
            {label}
            {required && <span className="text-destructive ml-0.5">*</span>}
          </FormLabel>
          <FormControl>
            <Textarea
              className="resize-none"
              maxLength={maxLength || DEFAULT_MAX_LENGTH}
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
