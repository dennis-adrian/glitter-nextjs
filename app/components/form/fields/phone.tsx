import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import { UseFormReturn } from "react-hook-form";

export default function PhoneInput({
  bottomBorderOnly,
  formControl,
  label,
  name,
}: {
  bottomBorderOnly?: boolean;
  formControl: UseFormReturn<any>["control"];
  label?: string;
  name: string;
}) {
  return (
    <FormField
      control={formControl}
      name={name}
      render={({ field }) => (
        <FormItem className="grid gap-2">
          {label && <FormLabel>{label}</FormLabel>}
          <FormControl>
            <div className="relative flex items-center">
              <span className="absolute left-2 text-muted-foreground">
                +591
              </span>
              <Input
                bottomBorderOnly={bottomBorderOnly}
                className="pl-14"
                type="tel"
                placeholder="7XXXXXXX"
                {...field}
              />
            </div>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
