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
import { UseFormReturn } from "react-hook-form";

export default function SelectInput({
  formControl,
  label,
  name,
  options,
  placeholder,
  variant,
  side,
}: {
  formControl: UseFormReturn<any>["control"];
  label?: string;
  name: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  side?: "top" | "bottom" | "left" | "right";
} & SelectVariants) {
  return (
    <FormField
      control={formControl}
      name={name}
      render={({ field }) => (
        <FormItem className="grid gap-2">
          {label && <FormLabel>{label}</FormLabel>}
          <FormControl>
            <Select onValueChange={field.onChange} defaultValue={field.value}>
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
