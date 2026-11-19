"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { type Resolver, useForm } from "react-hook-form";

import { AlertCircleIcon, ArrowLeftIcon, CheckIcon, XIcon } from "lucide-react";

import GlitterLogo from "@/app/components/landing/glitter-logo";
import { Button, buttonVariants } from "@/app/components/ui/button";
import { Form } from "@/app/components/ui/form";
import VolunteerApplicationReceived from "@/app/components/volunteers/volunteer-application-received";
import {
  AboutYouStep,
  LastStep,
  PersonalStep,
  ShiftsAndRolesStep,
  type VolunteerFormValues,
} from "@/app/components/volunteers/volunteer-application-steps";
import { captureClientEvent } from "@/app/lib/posthog-capture";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";
import { cn } from "@/app/lib/utils";
import { submitVolunteerApplication } from "@/app/lib/volunteers/actions";
import {
  volunteerFormStartedProperties,
  volunteerFormStepViewedProperties,
  volunteerFormSubmittedProperties,
} from "@/app/lib/volunteers/analytics";
import {
  VOLUNTEER_COPY,
  VOLUNTEER_STEPS,
  VOLUNTEERS_PATH,
  type VolunteerRole,
  type VolunteerShift,
} from "@/app/lib/volunteers/definitions";
import {
  browserSessionStorage,
  clearVolunteerDraft,
  readVolunteerDraft,
  writeVolunteerDraft,
} from "@/app/lib/volunteers/draft";
import {
  buildVolunteerApplicationSchema,
  buildVolunteerSectionSchema,
  type VolunteerApplicationValues,
} from "@/app/lib/volunteers/schema";

export type VolunteerApplicationWizardProps = {
  festivalId: number;
  festivalName: string;
  roles: VolunteerRole[];
  shifts: VolunteerShift[];
  ageCutoffDate: string;
  applicationsCloseAt: Date;
  /** "lunes 30 de noviembre a las 23:59". */
  closesLabel: string;
  /** "30 de noviembre". */
  closesOn: string;
  /** "sábado 5 de diciembre", or null while it is not set. */
  induction: string | null;
};

const DEFAULT_VALUES: VolunteerFormValues = {
  fullName: "",
  birthdate: "",
  phone: "",
  email: "",
  zone: "",
  shiftIds: [],
  firstChoiceRoleId: "",
  secondChoiceRoleId: "",
  experience: [],
  experienceNotes: "",
  portfolio: "",
  motivation: "",
  referralSource: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  commitmentConsent: false,
  dataConsent: false,
  imageConsent: false,
  website: "",
};

const LAST_STEP = VOLUNTEER_STEPS.length - 1;

/**
 * /voluntarios/postular: the application in four steps, one form underneath.
 *
 * Each step validates only its own schema section (buildVolunteerSectionSchema)
 * before moving on; the full schema runs on send, as on the server. Answers
 * live in one react-hook-form instance, so going back loses nothing, and in
 * sessionStorage, so a reload does not either.
 */
const subscribeNever = () => () => {};

/**
 * The draft lives in sessionStorage, which the server cannot read. The server
 * and the first client render show an empty form; once hydrated, the wizard
 * mounts again with whatever draft the tab holds.
 */
export default function VolunteerApplicationWizard(
  props: VolunteerApplicationWizardProps,
) {
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  return hydrated ? (
    <Wizard key="client" {...props} restoreDraft />
  ) : (
    <Wizard key="server" {...props} restoreDraft={false} />
  );
}

function Wizard({
  restoreDraft,
  ...props
}: VolunteerApplicationWizardProps & { restoreDraft: boolean }) {
  const {
    festivalId,
    festivalName,
    roles,
    shifts,
    ageCutoffDate,
    applicationsCloseAt,
    closesLabel,
    closesOn,
    induction,
  } = props;
  const router = useRouter();
  const [initialDraft] = useState(() =>
    restoreDraft
      ? readVolunteerDraft(browserSessionStorage(), festivalId, {
          roleIds: roles.map((role) => role.id),
          shiftIds: shifts.map((shift) => shift.id),
        })
      : null,
  );
  const [step, setStep] = useState(initialDraft?.step ?? 0);
  const [received, setReceived] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const stepRef = useRef(initialDraft?.step ?? 0);
  const fullValidationRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const context = useMemo(
    () => ({
      roleIds: roles.map((role) => role.id),
      shiftIds: shifts.map((shift) => shift.id),
      ageCutoffDate,
      applicationsCloseAt,
    }),
    [roles, shifts, ageCutoffDate, applicationsCloseAt],
  );

  /** Which step owns each field, to send a failed full check to its step. */
  const fieldSteps = useMemo(() => {
    const map = new Map<string, number>();
    VOLUNTEER_STEPS.forEach((definition, index) => {
      const shape = buildVolunteerSectionSchema(context, definition.section)
        .shape as Record<string, unknown>;
      for (const field of Object.keys(shape)) map.set(field, index);
    });
    return map;
  }, [context]);

  const resolver = useMemo<Resolver<VolunteerFormValues>>(() => {
    const full = zodResolver(buildVolunteerApplicationSchema(context));
    const sections = VOLUNTEER_STEPS.map((definition) =>
      zodResolver(buildVolunteerSectionSchema(context, definition.section)),
    );
    // The schemas coerce (role ids, defaults), so their output type differs
    // from the raw values the steps hold; the submit handler reads the full
    // schema's output.
    return ((values, resolverContext, options) =>
      (fullValidationRef.current ? full : sections[stepRef.current]!)(
        values as never,
        resolverContext,
        options as never,
      )) as Resolver<VolunteerFormValues>;
  }, [context]);

  const form = useForm<VolunteerFormValues>({
    resolver,
    mode: "onTouched",
    defaultValues: { ...DEFAULT_VALUES, ...initialDraft?.values },
  });

  // Keep the draft up to date (restored above, before the first render).
  useEffect(() => {
    if (!restoreDraft) return;
    const storage = browserSessionStorage();
    return form.subscribe({
      formState: { values: true },
      callback: ({ values }) =>
        writeVolunteerDraft(storage, festivalId, {
          step: stepRef.current,
          values: values as Record<string, unknown>,
        }),
    });
  }, [form, festivalId, restoreDraft]);

  // Only the hydrated instance reports, so a step counts once.
  useEffect(() => {
    if (!restoreDraft) return;
    captureClientEvent(
      POSTHOG_EVENTS.VOLUNTEER_FORM_STEP_VIEWED,
      volunteerFormStepViewedProperties(festivalId, step),
    );
  }, [festivalId, step, restoreDraft]);

  const goToStep = useCallback(
    (next: number) => {
      const clamped = Math.min(Math.max(next, 0), LAST_STEP);
      stepRef.current = clamped;
      setStep(clamped);
      setStepError(null);
      writeVolunteerDraft(browserSessionStorage(), festivalId, {
        step: clamped,
        values: form.getValues() as Record<string, unknown>,
      });
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0 });
        requestAnimationFrame(() => headingRef.current?.focus());
      }
    },
    [festivalId, form],
  );

  function focusFirstError() {
    requestAnimationFrame(() => {
      const invalid = formRef.current?.querySelector<HTMLElement>(
        '[aria-invalid="true"]',
      );
      invalid?.scrollIntoView?.({ block: "center" });
      invalid?.focus();
    });
  }

  /** "Form started" fires once per page load, on the first touch of a field. */
  const startedRef = useRef(false);
  function handleFirstInteraction(event: SyntheticEvent) {
    if (startedRef.current) return;
    const target = event.target as HTMLElement;
    const field =
      target.getAttribute("name") ??
      target
        .closest("[data-volunteer-step]")
        ?.getAttribute("data-volunteer-step");
    if (!field || field === "website") return;
    startedRef.current = true;
    captureClientEvent(
      POSTHOG_EVENTS.VOLUNTEER_FORM_STARTED,
      volunteerFormStartedProperties({ festivalId, field }),
    );
  }

  async function handleContinue() {
    const valid = await form.trigger();
    if (!valid) {
      setStepError(VOLUNTEER_COPY.reviewFields);
      focusFirstError();
      return;
    }
    goToStep(step + 1);
  }

  async function handleSubmit() {
    fullValidationRef.current = true;
    let parsed: VolunteerApplicationValues | null = null;
    try {
      await form.handleSubmit(
        (values) => {
          parsed = values as unknown as VolunteerApplicationValues;
        },
        (errors) => {
          if (errors.root) setStepError(errors.root.message ?? null);
        },
      )();
    } finally {
      fullValidationRef.current = false;
    }

    if (!parsed) {
      // Something on an earlier step no longer passes: go back to it.
      const firstInvalid = Object.keys(form.formState.errors)
        .map((field) => fieldSteps.get(field))
        .filter((index): index is number => index !== undefined)
        .sort((a, b) => a - b)[0];
      if (firstInvalid !== undefined && firstInvalid !== step) {
        goToStep(firstInvalid);
        await form.trigger();
      }
      setStepError((current) => current ?? VOLUNTEER_COPY.reviewFields);
      focusFirstError();
      return;
    }

    setIsSubmitting(true);
    setStepError(null);
    try {
      // The raw input, not `parsed`: the server parses it with the same
      // schema, and the parsed output would not parse again.
      const result = await submitVolunteerApplication(
        festivalId,
        form.getValues(),
      );
      if (result.success) {
        captureClientEvent(
          POSTHOG_EVENTS.VOLUNTEER_FORM_SUBMITTED,
          volunteerFormSubmittedProperties(festivalId, parsed),
        );
        clearVolunteerDraft(browserSessionStorage(), festivalId);
        setReceived(true);
        window.scrollTo({ top: 0 });
        return;
      }
      if (result.closed) {
        clearVolunteerDraft(browserSessionStorage(), festivalId);
        router.replace(VOLUNTEERS_PATH);
        router.refresh();
        return;
      }
      setStepError(result.message);
    } catch (error) {
      console.error(error);
      setStepError(VOLUNTEER_COPY.genericError);
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
        <VolunteerApplicationReceived closesOn={closesOn} />
      </div>
    );
  }

  const current = VOLUNTEER_STEPS[step]!;
  const isLast = step === LAST_STEP;
  const primaryLabel = isSubmitting
    ? "Enviando..."
    : isLast
      ? "Enviar postulación"
      : "Continuar";

  return (
    <div className="flex min-h-dvh flex-col bg-brand-elevated text-brand-ink">
      {/* Phone: back, step count, exit, progress. */}
      <header className="sticky top-0 z-30 flex flex-col gap-2 border-b border-brand-border bg-brand-elevated px-3 pt-2 pb-3 md:hidden">
        <div className="flex items-center justify-between gap-2">
          {step === 0 ? (
            <Link
              href={VOLUNTEERS_PATH}
              aria-label="Volver a la página de voluntarios"
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
            Paso {step + 1} de {VOLUNTEER_STEPS.length}
          </span>
          <Link
            href={VOLUNTEERS_PATH}
            aria-label="Salir del formulario"
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
          aria-valuemax={VOLUNTEER_STEPS.length}
          aria-valuenow={step + 1}
          aria-valuetext={`Paso ${step + 1} de ${VOLUNTEER_STEPS.length}: ${current.navLabel}`}
          className="grid grid-cols-4 gap-1.5 px-2"
        >
          {VOLUNTEER_STEPS.map((definition, index) => (
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
            href={VOLUNTEERS_PATH}
            className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-brand-primary hover:underline"
          >
            <XIcon className="size-4" aria-hidden />
            Salir del formulario
          </Link>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col md:flex-row md:items-start md:gap-12 md:px-10 md:pt-12 md:pb-16">
        <nav
          aria-label="Pasos del formulario"
          className="hidden md:block md:w-[260px] md:flex-none"
        >
          <h1 className="mb-5 font-display text-2xl leading-8 font-extrabold tracking-[-0.5px] text-brand-ink">
            {VOLUNTEER_COPY.applyTitle}
          </h1>
          <ol className="flex flex-col gap-1 text-sm leading-5">
            {VOLUNTEER_STEPS.map((definition, index) => {
              const state =
                index < step ? "done" : index === step ? "current" : "next";
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
              return (
                <li key={definition.section}>
                  {state === "done" ? (
                    <button
                      type="button"
                      onClick={() => goToStep(index)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-brand-neutral-strong hover:bg-brand-lavender/60"
                    >
                      {marker}
                      <span>
                        {definition.navLabel}
                        <span className="sr-only">
                          {" "}
                          (completo, volver a este paso)
                        </span>
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
                      <span>{definition.navLabel}</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="mx-3 mt-5 text-xs leading-4 text-muted-foreground">
            Postulaciones hasta el {closesLabel}.
          </p>
        </nav>

        <Form {...form}>
          <form
            ref={formRef}
            noValidate
            aria-labelledby="volunteer-step-title"
            onSubmit={handleFormSubmit}
            onFocusCapture={handleFirstInteraction}
            onPointerDownCapture={handleFirstInteraction}
            data-volunteer-step={current.section}
            className="flex min-w-0 flex-1 flex-col gap-6 px-5 pt-6 pb-40 md:max-w-[640px] md:gap-8 md:rounded-[20px] md:border md:border-brand-border md:bg-brand-card md:p-10"
          >
            <h1 className="sr-only md:hidden">{VOLUNTEER_COPY.applyTitle}</h1>
            <div>
              <h2
                id="volunteer-step-title"
                ref={headingRef}
                tabIndex={-1}
                className="font-display text-[30px] leading-9 font-extrabold tracking-[-0.5px] text-brand-ink outline-none"
              >
                {current.title}
              </h2>
              <p className="mt-2 text-brand-neutral">{current.lead}</p>
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

            {step === 0 ? <PersonalStep ageCutoffDate={ageCutoffDate} /> : null}
            {step === 1 ? (
              <ShiftsAndRolesStep shifts={shifts} roles={roles} />
            ) : null}
            {step === 2 ? <AboutYouStep /> : null}
            {step === 3 ? (
              <LastStep
                festivalName={festivalName}
                induction={induction}
                shifts={shifts}
                roles={roles}
                onEditStep={goToStep}
              />
            ) : null}

            {/* Desktop actions, inside the card. */}
            <div className="hidden flex-wrap items-center justify-between gap-3 md:flex">
              {step > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  onClick={() => goToStep(step - 1)}
                >
                  Atrás
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
                  <p className="text-xs leading-4 text-muted-foreground">
                    {VOLUNTEER_COPY.notGuaranteed}
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
                  {VOLUNTEER_COPY.notGuaranteed}
                </p>
              ) : null}
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
