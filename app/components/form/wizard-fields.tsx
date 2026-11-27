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
import { RadioGroup, RadioGroupItem } from "@/app/components/ui/radio-group";
import { cn } from "@/app/lib/utils";

/**
 * Field building blocks for the step-by-step public forms (volunteers,
 * cultural activities). Each wires its control to
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
  placeholder,
  hint,
  rows = 4,
}: {
  name: string;
  label: string;
  /** Shown as a hint beside the counter; the schema enforces it. */
  minLength?: number;
  maxLength: number;
  required?: boolean;
  placeholder?: string;
  /** Under the label, above the box. */
  hint?: ReactNode;
  rows?: number;
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
            {hint ? <FormDescription>{hint}</FormDescription> : null}
            <FormControl>
              <textarea
                {...field}
                value={field.value ?? ""}
                minLength={minLength}
                maxLength={maxLength}
                placeholder={placeholder}
                rows={rows}
                aria-required={required || undefined}
                className="min-h-28 w-full resize-none rounded-md border border-input bg-card px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none md:text-sm"
              />
            </FormControl>
            {hint ? (
              // The hint above is the description; the counter is extra.
              <p className="flex justify-between gap-3 text-sm text-muted-foreground">
                <span>
                  {minLength ? `Mínimo ${minLength} caracteres.` : null}
                </span>
                <span className="tabular-nums">
                  {length}/{maxLength}
                </span>
              </p>
            ) : (
              <FormDescription className="flex justify-between gap-3">
                <span>
                  {minLength ? `Mínimo ${minLength} caracteres.` : null}
                </span>
                <span className="tabular-nums">
                  {length}/{maxLength}
                </span>
              </FormDescription>
            )}
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

export type RadioCardOption = {
  value: string;
  title: string;
  /** One short line under the title, full width. */
  description?: ReactNode;
  /** A decorative icon beside the title. */
  icon?: ReactNode;
  /**
   * Shown inside the card while it is selected, after the label (a label
   * can't hold another field): e.g. a follow-up question.
   */
  extra?: ReactNode;
};

/**
 * A single choice as a stack of cards. Each card is its radio's label, so the
 * whole card selects it; arrow keys move between them (Radix radio group).
 */
export function RadioCardGroupField({
  name,
  options,
  ariaLabelledBy,
  ariaLabel,
  required,
  onValueChange,
}: {
  name: string;
  options: readonly RadioCardOption[];
  ariaLabelledBy?: string;
  ariaLabel?: string;
  required?: boolean;
  /** After the form value changes, e.g. for analytics. */
  onValueChange?: (value: string) => void;
}) {
  return (
    <FormField
      name={name}
      render={({ field }) => (
        <FormItem className="grid min-w-0 gap-2">
          <FormControl>
            <RadioGroup
              value={field.value ?? ""}
              onValueChange={(value) => {
                field.onChange(value);
                onValueChange?.(value);
              }}
              onBlur={field.onBlur}
              name={field.name}
              aria-label={ariaLabel}
              aria-labelledby={ariaLabelledBy}
              aria-required={required || undefined}
              className="grid gap-3"
            >
              {options.map((option) => (
                <RadioCard
                  key={option.value}
                  name={name}
                  option={option}
                  selected={field.value === option.value}
                />
              ))}
            </RadioGroup>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function RadioCard({
  name,
  option,
  selected,
}: {
  name: string;
  option: RadioCardOption;
  selected: boolean;
}) {
  const id = `${name}-${option.value}`;
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border bg-card transition-colors",
        selected ? "border-primary bg-primary/5" : "border-border",
      )}
    >
      <label
        htmlFor={id}
        className="flex min-h-11 cursor-pointer flex-col gap-2 p-4"
      >
        <span className="flex min-w-0 items-center gap-3">
          <RadioGroupItem id={id} value={option.value} className="flex-none" />
          {option.icon ? (
            <span
              className="flex size-10 flex-none items-center justify-center rounded-full bg-brand-lavender text-brand-primary"
              aria-hidden
            >
              {option.icon}
            </span>
          ) : null}
          <span className="min-w-0 font-semibold break-words text-brand-ink">
            {option.title}
          </span>
        </span>
        {option.description ? (
          <span className="text-sm leading-5 break-words text-brand-neutral">
            {option.description}
          </span>
        ) : null}
      </label>
      {selected && option.extra ? (
        <div className="px-4 pb-4">{option.extra}</div>
      ) : null}
    </div>
  );
}
