"use client";

import { useFormContext, useWatch } from "react-hook-form";

import { GiftIcon, MapPinIcon, PlusIcon, Trash2Icon } from "lucide-react";

import CulturalActivityCategoryIcon from "@/app/components/cultural-activities/category-icon";
import {
  ChoiceRow,
  PhoneField,
  RadioCardGroupField,
  TextAreaField,
  TextField,
} from "@/app/components/form/wizard-fields";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import {
  FormField,
  FormItem,
  FormMessage,
  useFormField,
} from "@/app/components/ui/form";
import {
  CULTURAL_ACTIVITY_CATEGORIES,
  CULTURAL_ACTIVITY_CATEGORY_CONFIG,
  CULTURAL_ACTIVITY_COPY,
  CULTURAL_ACTIVITY_DESCRIPTION_MAX_LENGTH,
  CULTURAL_ACTIVITY_MAX_SOCIAL_LINKS,
  CULTURAL_ACTIVITY_MAX_WORKSHOP_CAPACITY,
  CULTURAL_ACTIVITY_OTHER_TYPE_MAX_LENGTH,
  CULTURAL_ACTIVITY_RELATED_OFFER_MAX_LENGTH,
  CULTURAL_ACTIVITY_SPACE_NEEDS_MAX_LENGTH,
  type LiveActCategory,
} from "@/app/lib/live_acts/definitions";
import type { CulturalActivityFormValues } from "@/app/lib/live_acts/schema";

/**
 * The three steps of /actividades-culturales/postular. Each renders fields of
 * the one form the wizard owns (useFormContext), so going back loses nothing.
 */

const copy = CULTURAL_ACTIVITY_COPY;

function RequiredMark() {
  return (
    <span className="ml-0.5 text-destructive" aria-hidden>
      *
    </span>
  );
}

export function TipoStep({
  onCategorySelected,
}: {
  onCategorySelected: (category: LiveActCategory) => void;
}) {
  const options = CULTURAL_ACTIVITY_CATEGORIES.map((category) => {
    const config = CULTURAL_ACTIVITY_CATEGORY_CONFIG[category];
    return {
      value: category,
      title: config.title,
      description: config.short,
      icon: (
        <CulturalActivityCategoryIcon category={category} className="size-5" />
      ),
      extra:
        category === "other" ? (
          <TextField
            name="otherType"
            label={copy.otherTypeLabel}
            placeholder={copy.otherTypePlaceholder}
            hint={copy.otherTypeHint}
            maxLength={CULTURAL_ACTIVITY_OTHER_TYPE_MAX_LENGTH}
            autoComplete="off"
            required
          />
        ) : undefined,
    };
  });
  return (
    <RadioCardGroupField
      name="category"
      options={options}
      ariaLabelledBy="cultural-activity-step-title"
      required
      onValueChange={(value) => onCategorySelected(value as LiveActCategory)}
    />
  );
}

export function ActividadIntro({
  category,
  onChangeType,
}: {
  category: LiveActCategory;
  onChangeType: () => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Badge variant="secondary" className="gap-1.5 px-3 py-1 text-sm">
        <CulturalActivityCategoryIcon category={category} className="size-4" />
        {CULTURAL_ACTIVITY_CATEGORY_CONFIG[category].title}
      </Badge>
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto min-h-11 px-2 text-brand-primary"
        onClick={onChangeType}
      >
        {copy.changeType}
      </Button>
    </div>
  );
}

export function ActividadStep({ category }: { category: LiveActCategory }) {
  const config = CULTURAL_ACTIVITY_CATEGORY_CONFIG[category];
  const isWorkshop = category === "workshop";
  return (
    <div className="flex flex-col gap-6">
      {isWorkshop ? (
        <div className="flex flex-col gap-3 rounded-xl bg-brand-lavender px-4 py-3.5 text-sm leading-5 text-brand-ink">
          <p className="flex items-start gap-2.5">
            <MapPinIcon
              className="mt-0.5 size-4 flex-none text-brand-primary"
              aria-hidden
            />
            <span className="min-w-0 break-words">
              {copy.workshopPlaceNote}
            </span>
          </p>
          <p className="flex items-start gap-2.5">
            <GiftIcon
              className="mt-0.5 size-4 flex-none text-brand-primary"
              aria-hidden
            />
            <span className="min-w-0 break-words">{copy.workshopCostNote}</span>
          </p>
        </div>
      ) : null}

      <TextField
        name="actName"
        label={config.actNameLabel}
        placeholder={config.actNamePlaceholder}
        maxLength={120}
        autoComplete="off"
        required
      />
      <TextAreaField
        name="description"
        label={
          config.descriptionRequired
            ? config.descriptionLabel
            : `${config.descriptionLabel} (opcional)`
        }
        hint={config.descriptionHint}
        placeholder={config.descriptionPlaceholder}
        maxLength={CULTURAL_ACTIVITY_DESCRIPTION_MAX_LENGTH}
        required={config.descriptionRequired}
      />
      <TextField
        name="resourceLink"
        label={config.resourceLinkLabel}
        hint={config.resourceLinkHint}
        placeholder="https://"
        type="url"
        inputMode="url"
        autoComplete="url"
        required
      />
      {config.capacity ? (
        <TextField
          name="workshopCapacity"
          label={config.capacity.label}
          hint={config.capacity.hint}
          type="number"
          inputMode="numeric"
          min={1}
          max={CULTURAL_ACTIVITY_MAX_WORKSHOP_CAPACITY}
          step={1}
          className="max-w-40"
          required
        />
      ) : null}
      {config.spaceNeeds ? (
        <TextAreaField
          name="spaceNeeds"
          label={`${config.spaceNeeds.label} (opcional)`}
          placeholder={config.spaceNeeds.placeholder}
          maxLength={CULTURAL_ACTIVITY_SPACE_NEEDS_MAX_LENGTH}
          rows={3}
        />
      ) : null}
      {config.relatedOffer ? (
        <TextField
          name="relatedOffer"
          label={`${config.relatedOffer.label} (opcional)`}
          placeholder={config.relatedOffer.placeholder}
          hint={config.relatedOffer.hint}
          maxLength={CULTURAL_ACTIVITY_RELATED_OFFER_MAX_LENGTH}
          autoComplete="off"
        />
      ) : null}

      <SocialLinks />

      {isWorkshop ? <NoCostAcknowledgement /> : null}
    </div>
  );
}

function SocialLinks() {
  const { control, setValue, getValues } =
    useFormContext<CulturalActivityFormValues>();
  const links = useWatch({ control, name: "socialLinks" }) ?? [];

  function update(next: string[]) {
    setValue("socialLinks", next, { shouldDirty: true });
  }

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
      <legend className="mb-2 p-0 text-sm font-medium break-words">
        {copy.socialLinksLegend}
      </legend>
      {links.map((_, index) => (
        <div key={index} className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <TextField
              name={`socialLinks.${index}`}
              label={`Enlace ${index + 1}`}
              placeholder="https://"
              type="url"
              inputMode="url"
              autoComplete="url"
              hideLabel
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 flex-none text-muted-foreground hover:text-destructive"
            aria-label={`Quitar enlace ${index + 1}`}
            onClick={() =>
              update(getValues("socialLinks").filter((__, i) => i !== index))
            }
          >
            <Trash2Icon className="size-4" aria-hidden />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        {links.length < CULTURAL_ACTIVITY_MAX_SOCIAL_LINKS ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => update([...getValues("socialLinks"), ""])}
          >
            <PlusIcon className="mr-1.5 size-4" aria-hidden />
            {copy.addLink}
          </Button>
        ) : null}
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {links.length} de {CULTURAL_ACTIVITY_MAX_SOCIAL_LINKS} enlaces
        </span>
      </div>
    </fieldset>
  );
}

function NoCostAcknowledgement() {
  return (
    <FormField
      name="noCostAcknowledged"
      render={({ field }) => (
        <FormItem className="grid min-w-0 gap-2">
          <NoCostRow
            checked={field.value === true}
            onCheckedChange={field.onChange}
            onBlur={field.onBlur}
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function NoCostRow({
  checked,
  onCheckedChange,
  onBlur,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onBlur: () => void;
}) {
  const { error, formItemId, formMessageId } = useFormField();
  return (
    <ChoiceRow
      id={formItemId}
      checked={checked}
      onCheckedChange={onCheckedChange}
      onBlur={onBlur}
      invalid={Boolean(error)}
      describedBy={error ? formMessageId : undefined}
      required
    >
      {copy.noCostLabel}
      <RequiredMark />
    </ChoiceRow>
  );
}

export function ContactoStep() {
  const { register } = useFormContext<CulturalActivityFormValues>();
  return (
    <div className="flex flex-col gap-6">
      <TextField
        name="contactName"
        label={copy.contactNameLabel}
        placeholder="Ej: María Pérez"
        autoComplete="name"
        required
      />
      <TextField
        name="contactEmail"
        label={copy.contactEmailLabel}
        placeholder="nombre@gmail.com"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        required
      />
      <PhoneField
        name="contactPhone"
        label={copy.contactPhoneLabel}
        hint={copy.contactPhoneHint}
        required
      />

      {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
      <div
        aria-hidden="true"
        className="absolute -left-[9999px] h-0 overflow-hidden"
      >
        <label>
          Sitio web
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            {...register("website")}
          />
        </label>
      </div>
    </div>
  );
}
