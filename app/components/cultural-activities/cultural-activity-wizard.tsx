"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { type Resolver, useForm, useWatch } from "react-hook-form";

import { AlertCircleIcon, ArrowLeftIcon, CheckIcon, XIcon } from "lucide-react";

import {
  ActividadIntro,
  ActividadStep,
  ContactoStep,
  TipoStep,
} from "@/app/components/cultural-activities/cultural-activity-steps";
import CulturalActivityReceived from "@/app/components/cultural-activities/cultural-activity-received";
import GlitterLogo from "@/app/components/landing/glitter-logo";
import { Button, buttonVariants } from "@/app/components/ui/button";
import { Form } from "@/app/components/ui/form";
import { createLiveAct } from "@/app/lib/live_acts/actions";
import {
  CULTURAL_ACTIVITIES_PATH,
  CULTURAL_ACTIVITY_CATEGORY_CONFIG,
  CULTURAL_ACTIVITY_COPY,
  CULTURAL_ACTIVITY_STEPS,
  type LiveActCategory,
} from "@/app/lib/live_acts/definitions";
import {
  buildCulturalActivityStepSchema,
  CULTURAL_ACTIVITY_FIELD_STEPS,
  culturalActivitySchema,
  type CulturalActivityFormValues,
  type CulturalActivityValues,
} from "@/app/lib/live_acts/schema";
import { captureClientEvent } from "@/app/lib/posthog-capture";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";
import { cn } from "@/app/lib/utils";

/*
 * The chrome (phone header with progress, desktop step list, card, fixed
 * phone action bar) follows the volunteer wizard
 * (volunteer-application-wizard.tsx). It is duplicated rather than shared:
 * that wizard's chrome is woven into its draft and closing-call logic.
 */

const copy = CULTURAL_ACTIVITY_COPY;
const STEPS = CULTURAL_ACTIVITY_STEPS;
const LAST_STEP = STEPS.length - 1;

function defaultValues(
  category: LiveActCategory | null,
): CulturalActivityFormValues {
  return {
    category: category ?? "",
    otherType: "",
    actName: "",
    description: "",
    resourceLink: "",
    socialLinks: [],
    workshopCapacity: "",
    spaceNeeds: "",
    relatedOffer: "",
    noCostAcknowledged: false,
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    website: "",
  };
}

export type CulturalActivityWizardProps = {
  /**
   * From `?tipo=`: starts on step 2 with this type chosen (on step 1 for
   * "other", whose free-text type is asked there).
   */
  initialCategory: LiveActCategory | null;
};

/**
 * /actividades-culturales/postular: the postulation in three steps, one form
 * underneath. Each step validates only its own fields (step 2's depend on the
 * type chosen in step 1); the full schema runs on send, as on the server.
 */
export default function CulturalActivityWizard({
  initialCategory,
}: CulturalActivityWizardProps) {
  // "Postular otra actividad" starts over from a fresh form.
  const [round, setRound] = useState(0);
  return (
    <Wizard
      key={round}
      initialCategory={round === 0 ? initialCategory : null}
      onApplyAnother={() => {
        setRound((value) => value + 1);
        window.scrollTo({ top: 0 });
      }}
    />
  );
}

function Wizard({
  initialCategory,
  onApplyAnother,
}: CulturalActivityWizardProps & { onApplyAnother: () => void }) {
  // "Otra actividad" asks its free-text type on step 1, so it starts there,
  // already chosen.
  const firstStep = initialCategory && initialCategory !== "other" ? 1 : 0;
  const [step, setStep] = useState(firstStep);
  const [received, setReceived] = useState<{
    actName: string;
    email: string;
    phone: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const stepRef = useRef(firstStep);
  const fullValidationRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const resolver = useMemo<Resolver<CulturalActivityFormValues>>(() => {
    const full = zodResolver(culturalActivitySchema);
    // The schemas coerce and transform, so their output type differs from
    // the raw values the steps hold; the submit handler reads the output.
    return ((values, context, options) => {
      if (fullValidationRef.current) {
        return full(values as never, context, options as never);
      }
      const section = STEPS[stepRef.current]!.section;
      const category = (values as CulturalActivityFormValues).category || null;
      return zodResolver(buildCulturalActivityStepSchema(section, category))(
        values as never,
        context,
        options as never,
      );
    }) as Resolver<CulturalActivityFormValues>;
  }, []);

  const form = useForm<CulturalActivityFormValues>({
    resolver,
    mode: "onTouched",
    defaultValues: defaultValues(initialCategory),
  });
  const category =
    useWatch({ control: form.control, name: "category" }) || null;

  useEffect(() => {
    if (received) return;
    captureClientEvent(POSTHOG_EVENTS.LIVE_ACT_FORM_STEP_VIEWED, {
      step_number: step + 1,
      step_name: STEPS[step]!.section,
    });
  }, [step, received]);

  const goToStep = useCallback((next: number) => {
    const clamped = Math.min(Math.max(next, 0), LAST_STEP);
    stepRef.current = clamped;
    setStep(clamped);
    setStepError(null);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0 });
      requestAnimationFrame(() => headingRef.current?.focus());
    }
  }, []);

  function focusFirstError() {
    requestAnimationFrame(() => {
      const invalid = formRef.current?.querySelector<HTMLElement>(
        '[aria-invalid="true"]',
      );
      // A radio group is not focusable itself: focus its chosen or first radio.
      const target =
        invalid?.getAttribute("role") === "radiogroup"
          ? (invalid.querySelector<HTMLElement>(
              '[role="radio"][aria-checked="true"]',
            ) ?? invalid.querySelector<HTMLElement>('[role="radio"]'))
          : invalid;
      target?.scrollIntoView?.({ block: "center" });
      target?.focus();
    });
  }

  function handleCategorySelected(value: LiveActCategory) {
    captureClientEvent(POSTHOG_EVENTS.LIVE_ACT_CATEGORY_SELECTED, {
      category: value,
    });
  }

  async function handleContinue() {
    const valid = await form.trigger();
    if (!valid) {
      setStepError(copy.reviewFields);
      focusFirstError();
      return;
    }
    goToStep(step + 1);
  }

  async function handleSubmit() {
    fullValidationRef.current = true;
    // Filled in by the success callback (a holder: TS can't see the write).
    const outcome: { values: CulturalActivityValues | null } = { values: null };
    // The fields that failed, from this run: formState is a render snapshot.
    let invalidFields: string[] = [];
    try {
      await form.handleSubmit(
        (values) => {
          outcome.values = values as unknown as CulturalActivityValues;
        },
        (errors) => {
          invalidFields = Object.keys(errors);
        },
      )();
    } finally {
      fullValidationRef.current = false;
    }

    const values = outcome.values;
    if (!values) {
      // Something on an earlier step no longer passes: go back to it.
      const firstInvalid = invalidFields
        .map((field) => CULTURAL_ACTIVITY_FIELD_STEPS.get(field))
        .filter((index): index is number => index !== undefined)
        .sort((a, b) => a - b)[0];
      if (firstInvalid !== undefined && firstInvalid !== step) {
        goToStep(firstInvalid);
        await form.trigger();
      }
      setStepError(copy.reviewFields);
      focusFirstError();
      return;
    }

    setIsSubmitting(true);
    setStepError(null);
    try {
      // The raw input, not `values`: the server parses it with the same
      // schema, and the parsed output would not parse again.
      const result = await createLiveAct(form.getValues());
      if (result.success) {
        captureClientEvent(POSTHOG_EVENTS.LIVE_ACT_SUBMITTED, {
          category: values.category,
        });
        setReceived({
          actName: values.actName,
          email: values.contactEmail,
          phone: values.contactPhone,
        });
        window.scrollTo({ top: 0 });
        return;
      }
      setStepError(result.message);
      // On a phone the sender is at the sticky button, far below the alert.
      window.scrollTo({ top: 0 });
    } catch (error) {
      console.error("createLiveAct failed", error);
      setStepError(copy.genericError);
      window.scrollTo({ top: 0 });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleFormSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    if (step === LAST_STEP) void handleSubmit();
    else void handleContinue();
  }

  if (received) {
    return (
      <div className="flex min-h-dvh flex-col">
        <header className="border-b border-brand-border bg-brand-elevated px-5 py-3.5">
          <Link href="/" aria-label="Productora Glitter, inicio">
            <GlitterLogo height={36} width={36} variant="dark" />
          </Link>
        </header>
        <CulturalActivityReceived
          actName={received.actName}
          email={received.email}
          phone={received.phone}
          onApplyAnother={onApplyAnother}
        />
      </div>
    );
  }

  const current = STEPS[step]!;
  const isLast = step === LAST_STEP;
  const lead =
    current.section === "actividad" && category
      ? CULTURAL_ACTIVITY_CATEGORY_CONFIG[category].lead
      : current.lead;
  const primaryLabel = isSubmitting
    ? copy.submitting
    : isLast
      ? copy.submit
      : copy.continue;

  function navSubLabel(index: number) {
    if (index === 0 && category && step > 0) {
      return CULTURAL_ACTIVITY_CATEGORY_CONFIG[category].title;
    }
    return null;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-brand-elevated text-brand-ink">
      {/* Phone: back, step count, exit, progress. */}
      <header className="sticky top-0 z-30 flex flex-col gap-2 border-b border-brand-border bg-brand-elevated px-3 pt-2 pb-3 md:hidden">
        <div className="flex items-center justify-between gap-2">
          {step === 0 ? (
            <Link
              href={CULTURAL_ACTIVITIES_PATH}
              aria-label={copy.backToLanding}
              className={buttonVariants({
                variant: "ghost",
                size: "icon",
                className: "size-11",
              })}
            >
              <ArrowLeftIcon className="size-5" aria-hidden />
            </Link>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label={`Volver al paso ${step}`}
              onClick={() => goToStep(step - 1)}
            >
              <ArrowLeftIcon className="size-5" aria-hidden />
            </Button>
          )}
          <span className="text-sm leading-5 font-semibold text-brand-neutral-strong">
            Paso {step + 1} de {STEPS.length}
          </span>
          <Link
            href={CULTURAL_ACTIVITIES_PATH}
            aria-label={copy.exitForm}
            className={buttonVariants({
              variant: "ghost",
              size: "icon",
              className: "size-11",
            })}
          >
            <XIcon className="size-5" aria-hidden />
          </Link>
        </div>
        <div
          role="progressbar"
          aria-label="Avance del formulario"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={step + 1}
          aria-valuetext={`Paso ${step + 1} de ${STEPS.length}: ${current.navLabel}`}
          className="grid gap-1.5 px-2"
          style={{ gridTemplateColumns: `repeat(${STEPS.length}, 1fr)` }}
        >
          {STEPS.map((definition, index) => (
            <span
              key={definition.section}
              className={cn(
                "h-1.5 rounded-full",
                index <= step ? "bg-brand-primary" : "bg-brand-lavender",
              )}
            />
          ))}
        </div>
      </header>

      {/* Desktop: logo and exit. */}
      <header className="hidden border-b border-brand-border md:block">
        <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-4 px-10 py-4">
          <Link href="/" aria-label="Productora Glitter, inicio">
            <GlitterLogo height={40} width={40} variant="dark" />
          </Link>
          <Link
            href={CULTURAL_ACTIVITIES_PATH}
            className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-brand-primary hover:underline"
          >
            <XIcon className="size-4" aria-hidden />
            {copy.exitForm}
          </Link>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col md:flex-row md:items-start md:gap-12 md:px-10 md:pt-12 md:pb-16">
        <nav
          aria-label="Pasos del formulario"
          className="hidden md:block md:w-[260px] md:flex-none"
        >
          <h1 className="mb-5 font-display text-2xl leading-8 font-extrabold tracking-[-0.5px] text-brand-ink">
            {copy.applyTitle}
          </h1>
          <ol className="flex flex-col gap-1 text-sm leading-5">
            {STEPS.map((definition, index) => {
              const state =
                index < step ? "done" : index === step ? "current" : "next";
              const subLabel = navSubLabel(index);
              const marker = (
                <span
                  className={cn(
                    "flex size-7 flex-none items-center justify-center rounded-full font-display font-bold",
                    state === "done" && "bg-brand-primary text-white",
                    state === "current" && "bg-brand-deep text-white",
                    state === "next" &&
                      "border border-brand-neutral text-brand-neutral",
                  )}
                  aria-hidden
                >
                  {state === "done" ? (
                    <CheckIcon className="size-4" />
                  ) : (
                    index + 1
                  )}
                </span>
              );
              const text = (
                <span className="flex min-w-0 flex-col">
                  <span>{definition.navLabel}</span>
                  {subLabel ? (
                    <span className="text-xs break-words text-brand-neutral">
                      {subLabel}
                    </span>
                  ) : null}
                </span>
              );
              return (
                <li key={definition.section}>
                  {state === "done" ? (
                    <button
                      type="button"
                      onClick={() => goToStep(index)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-brand-neutral-strong hover:bg-brand-lavender/60"
                    >
                      {marker}
                      {text}
                      <span className="sr-only">
                        (completo, volver a este paso)
                      </span>
                    </button>
                  ) : (
                    <span
                      aria-current={state === "current" ? "step" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5",
                        state === "current"
                          ? "bg-brand-lavender font-bold text-brand-ink"
                          : "text-brand-neutral",
                      )}
                    >
                      {marker}
                      {text}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="mx-3 mt-5 text-xs leading-4 text-muted-foreground">
            {copy.navFootnote}
          </p>
        </nav>

        <Form {...form}>
          <form
            ref={formRef}
            noValidate
            aria-labelledby="cultural-activity-step-title"
            onSubmit={handleFormSubmit}
            className="flex min-w-0 flex-1 flex-col gap-6 px-5 pt-6 pb-44 md:max-w-[640px] md:gap-8 md:rounded-[20px] md:border md:border-brand-border md:bg-brand-card md:p-10"
          >
            <h1 className="sr-only md:hidden">{copy.applyTitle}</h1>
            <div>
              {current.section === "actividad" && category ? (
                <ActividadIntro
                  category={category}
                  onChangeType={() => goToStep(0)}
                />
              ) : null}
              <h2
                id="cultural-activity-step-title"
                ref={headingRef}
                tabIndex={-1}
                className="font-display text-[30px] leading-9 font-extrabold tracking-[-0.5px] text-brand-ink outline-none"
              >
                {current.title}
              </h2>
              {lead ? (
                <p className="mt-2 break-words text-brand-neutral">{lead}</p>
              ) : null}
            </div>

            {stepError ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm leading-5 font-medium break-words text-destructive"
              >
                <AlertCircleIcon
                  className="mt-0.5 size-4 flex-none"
                  aria-hidden
                />
                <span className="min-w-0">{stepError}</span>
              </p>
            ) : null}

            {current.section === "tipo" ? (
              <TipoStep onCategorySelected={handleCategorySelected} />
            ) : null}
            {current.section === "actividad" && category ? (
              <ActividadStep key={category} category={category} />
            ) : null}
            {current.section === "contacto" ? <ContactoStep /> : null}

            {/* Desktop actions, inside the card. */}
            <div className="hidden flex-wrap items-center justify-between gap-3 md:flex">
              {step > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  onClick={() => goToStep(step - 1)}
                >
                  {copy.back}
                </Button>
              ) : (
                <span />
              )}
              <div className="flex flex-col items-end gap-2">
                <Button
                  type="submit"
                  variant="cta"
                  size="lg"
                  wrap
                  disabled={isSubmitting}
                >
                  {primaryLabel}
                </Button>
                {isLast ? (
                  <p className="text-right text-xs leading-4 text-muted-foreground">
                    {copy.notGuaranteed}
                  </p>
                ) : null}
              </div>
            </div>

            {/* Phone: the primary action stays at the bottom of the screen. */}
            <div className="fixed inset-x-0 bottom-app-chrome z-30 flex flex-col gap-2 border-t border-brand-border bg-brand-elevated px-5 pt-3 pb-[max(20px,var(--app-bottom-safe-area,env(safe-area-inset-bottom)))] md:hidden">
              <Button
                type="submit"
                variant="cta"
                size="lg"
                wrap
                className="w-full"
                disabled={isSubmitting}
              >
                {primaryLabel}
              </Button>
              {isLast ? (
                <p className="text-center text-xs leading-4 text-muted-foreground">
                  {copy.notGuaranteed}
                </p>
              ) : null}
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
