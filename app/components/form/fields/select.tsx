import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectVariants,
} from "@/app/components/ui/select";
import { cn } from "@/app/lib/utils";
import { UseFormReturn } from "react-hook-form";

export default function SelectInput({
  className,
  formControl,
  label,
  name,
  options,
  placeholder,
  variant,
  side,
  defaultValue,
  disabled,
}: {
  className?: string;
  formControl: UseFormReturn<any>["control"];
  label?: string;
  name: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  side?: "top" | "bottom" | "left" | "right";
  defaultValue?: string;
  disabled?: boolean;
} & SelectVariants) {
  return (
    <FormField
      control={formControl}
      name={name}
      render={({ field }) => (
        <FormItem className={cn("grid gap-2", className)}>
          {label && <FormLabel>{label}</FormLabel>}
          <FormControl>
            <Select
              onValueChange={field.onChange}
              disabled={disabled}
              value={defaultValue}
            >
              <FormControl>
                <SelectTrigger variant={variant}>
                  <SelectValue placeholder={placeholder} />
                </SelectTrigger>
              </FormControl>
              <SelectContent side={side}>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
