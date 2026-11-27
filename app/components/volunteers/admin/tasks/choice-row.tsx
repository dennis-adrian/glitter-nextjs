"use client";

import type { ReactNode } from "react";

import { Checkbox } from "@/app/components/ui/checkbox";
import { cn } from "@/app/lib/utils";

/**
 * A whole-row checkbox: a shift or a person. The row is the label, so the
 * whole of it toggles; selected rows take the primary border and tint.
 */
export default function ChoiceRow({
  id,
  checked,
  onCheckedChange,
  label,
  children,
  aside,
  below,
  disabled,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** The checkbox's accessible name. */
  label: string;
  children: ReactNode;
  aside?: ReactNode;
  /** Controls under the label, outside it (a role select). */
  below?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-start gap-3 rounded-lg border bg-card p-3 transition-colors",
        checked && "border-primary bg-primary/5 dark:bg-accent",
      )}
    >
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        aria-label={label}
        className="mt-0.5"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <label htmlFor={id} className="min-w-0 cursor-pointer break-words">
          {children}
        </label>
        {below}
      </div>
      {aside}
    </div>
  );
}
