"use client";

import type { ReactNode } from "react";
import { PhoneInput as InternationalPhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import "@/app/components/form/fields/styles.css";

import { Checkbox } from "@/app/components/ui/checkbox";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import { cn } from "@/app/lib/utils";

/**
 * Field building blocks for the volunteer steps. Each wires its control to
 * the label, hint and error through ui/form, so every control has a real
 * label, `aria-invalid` and `aria-describedby`, and the step can find and
 * focus its first error by `aria-invalid`.
 */

/** Inputs and selects are 44px tall: a phone-sized touch target. */
export const controlClassName = "h-11 bg-card text-base md:text-sm";

function RequiredMark() {
  return (
    <span className="ml-0.5 text-destructive" aria-hidden>
      *
    </span>
  );
}

export function TextField({
  name,
  label,
  hint,
  required,
  ...inputProps
}: {
  name: string;
  label: string;
  hint?: ReactNode;
  required?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name">) {
  return (
    <FormField
      name={name}
      render={({ field }) => (
        <FormItem className="grid min-w-0 gap-2">
          <FormLabel>
            {label}
            {required ? <RequiredMark /> : null}
          </FormLabel>
          <FormControl>
            <Input
              {...inputProps}
              {...field}
              value={field.value ?? ""}
              aria-required={required || undefined}
              className={controlClassName}
            />
          </FormControl>
          {hint ? <FormDescription>{hint}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function TextAreaField({
  name,
  label,
  minLength,
  maxLength,
  required,
}: {
  name: string;
  label: string;
  /** Shown as a hint beside the counter; the schema enforces it. */
  minLength?: number;
  maxLength: number;
  required?: boolean;
}) {
  return (
    <FormField
      name={name}
      render={({ field }) => {
        const length = String(field.value ?? "").length;
        return (
          <FormItem className="grid min-w-0 gap-2">
            <FormLabel>
              {label}
              {required ? <RequiredMark /> : null}
            </FormLabel>
            <FormControl>
              <textarea
                {...field}
                value={field.value ?? ""}
                minLength={minLength}
                maxLength={maxLength}
                rows={4}
                aria-required={required || undefined}
                className="min-h-28 w-full resize-none rounded-md border border-input bg-card px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none md:text-sm"
              />
            </FormControl>
            <FormDescription className="flex justify-between gap-3">
              <span>
                {minLength ? `Mínimo ${minLength} caracteres.` : null}
              </span>
              <span className="tabular-nums">
                {length} / {maxLength}
              </span>
            </FormDescription>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

/** A native select: the phone's own picker, and a real label. */
export function SelectField({
  name,
  label,
  options,
  placeholder = "Seleccioná una opción",
  required,
}: {
  name: string;
  label: string;
  options: readonly { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <FormField
      name={name}
      render={({ field }) => (
        <FormItem className="grid min-w-0 gap-2">
          <FormLabel>
            {label}
            {required ? <RequiredMark /> : null}
          </FormLabel>
          <FormControl>
            <select
              {...field}
              value={field.value ?? ""}
              aria-required={required || undefined}
              className={cn(
                "w-full min-w-0 rounded-md border border-input px-3 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
                controlClassName,
              )}
            >
              <option value="" disabled>
                {placeholder}
              </option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** The country picker joined to the number, defaulting to Bolivia (+591). */
export function PhoneField({
  name,
  label,
  required,
}: {
  name: string;
  label: string;
  required?: boolean;
}) {
  return (
    <FormField
      name={name}
      render={({ field }) => (
        <FormItem className="grid min-w-0 gap-2">
          <FormLabel>
            {label}
            {required ? <RequiredMark /> : null}
          </FormLabel>
          <PhoneControl
            value={field.value ?? ""}
            onChange={field.onChange}
            onBlur={field.onBlur}
            required={required}
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function PhoneControl({
  value,
  onChange,
  onBlur,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  required?: boolean;
}) {
  const { error, formItemId, formMessageId } = useFormField();
  return (
    <div className="min-w-0 [&_.react-international-phone-country-selector-button]:h-11 [&_.react-international-phone-input]:h-11 [&_.react-international-phone-input]:min-w-0 [&_.react-international-phone-input]:flex-1 [&_.react-international-phone-input]:text-base [&_.react-international-phone-input-container]:flex [&_.react-international-phone-input]:bg-card! [&_.react-international-phone-country-selector-button]:bg-card!">
      <InternationalPhoneInput
        className="phone-input"
        value={value}
        onChange={(phone) => onChange(phone)}
        forceDialCode
        defaultCountry="bo"
        preferredCountries={["bo", "ar", "br", "pe", "co", "us"]}
        inputProps={{
          id: formItemId,
          onBlur,
          autoComplete: "tel",
          "aria-invalid": Boolean(error),
          "aria-required": required || undefined,
          "aria-describedby": error ? formMessageId : undefined,
        }}
      />
    </div>
  );
}

/**
 * A whole-row checkbox: the shift choices and the consents. The row is the
 * label, so the full 44px+ row toggles it.
 */
export function ChoiceRow({
  checked,
  onCheckedChange,
  onBlur,
  children,
  invalid,
  describedBy,
  id,
  required,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onBlur?: () => void;
  children: ReactNode;
  invalid?: boolean;
  describedBy?: string;
  id?: string;
  /** Announced as required; the visual mark sits on the group's legend. */
  required?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 min-w-0 cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 text-sm leading-5 transition-colors",
        checked ? "border-primary bg-primary/5" : "border-border",
      )}
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        onBlur={onBlur}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        className="mt-0.5"
      />
      <span className="min-w-0 break-words">{children}</span>
    </label>
  );
}
