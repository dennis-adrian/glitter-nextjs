"use client";

import type { Control, FieldValues, Path } from "react-hook-form";

import { Checkbox } from "@/app/components/ui/checkbox";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/app/components/ui/form";
import {
  NEWS_OPT_IN_HINT,
  NEWS_OPT_IN_LABEL,
} from "@/app/lib/emails/news-opt-in";

/**
 * "Quiero recibir novedades" (docs/IMPLEMENTATION-comunicados.md §L): unticked
 * by default, so only someone who ticks it is asked to get Productora
 * Glitter's news by email. Used by visitor registration and guest checkout.
 */
export default function NewsOptInField<T extends FieldValues>({
  control,
  name,
}: {
  control: Control<T>;
  name: Path<T>;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-row items-start gap-3 space-y-0">
          <FormControl>
            <Checkbox
              checked={field.value === true}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
          </FormControl>
          <div className="grid gap-1 leading-none">
            <FormLabel className="font-normal">{NEWS_OPT_IN_LABEL}</FormLabel>
            <p className="text-xs text-muted-foreground">{NEWS_OPT_IN_HINT}</p>
          </div>
        </FormItem>
      )}
    />
  );
}
