"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type SyntheticEvent, useMemo, useRef, useState } from "react";
import { type Control, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import PhoneInput from "@/app/components/form/fields/phone";
import SelectInput from "@/app/components/form/fields/select";
import TextInput from "@/app/components/form/fields/text";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { Textarea } from "@/app/components/ui/textarea";
import VolunteerApplicationReceived from "@/app/components/volunteers/volunteer-application-received";
import VolunteerCallClosed from "@/app/components/volunteers/volunteer-call-closed";
import { captureClientEvent } from "@/app/lib/posthog-capture";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";
import { SITE_CONTACT_EMAIL } from "@/app/lib/site-contact";
import { submitVolunteerApplication } from "@/app/lib/volunteers/actions";
import {
  volunteerFormStartedProperties,
  volunteerFormSubmittedProperties,
} from "@/app/lib/volunteers/analytics";
import {
  VOLUNTEER_COPY,
  VOLUNTEER_EXPERIENCE_OPTIONS,
  VOLUNTEER_MOTIVATION_MAX_LENGTH,
  VOLUNTEER_PRIVACY_NOTICE,
  VOLUNTEER_REFERRAL_OPTIONS,
  type VolunteerRole,
  type VolunteerShift,
} from "@/app/lib/volunteers/definitions";
import { formatShiftSummary } from "@/app/lib/volunteers/format";
import {
  buildVolunteerApplicationSchema,
  type VolunteerApplicationInput,
  type VolunteerApplicationValues,
} from "@/app/lib/volunteers/schema";

type Props = {
  festivalId: number;
  roles: VolunteerRole[];
  shifts: VolunteerShift[];
  ageCutoffDate: string;
  applicationsCloseAt: Date;
};

/** The form's raw state: role ids are select strings until the schema coerces them. */
type FormInput = Omit<
  VolunteerApplicationInput,
  "firstChoiceRoleId" | "secondChoiceRoleId"
> & { firstChoiceRoleId: string; secondChoiceRoleId: string };

/**
 * Placeholder volunteer form. The logic it relies on (schema, action,
 * analytics) lives in app/lib/volunteers; restyling or replacing this file
 * should only touch markup.
 */
export default function VolunteerApplicationForm({
  festivalId,
  roles,
  shifts,
  ageCutoffDate,
  applicationsCloseAt,
}: Props) {
  const [outcome, setOutcome] = useState<"form" | "received" | "closed">(
    "form",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const schema = useMemo(
    () =>
      buildVolunteerApplicationSchema({
        roleIds: roles.map((role) => role.id),
        shiftIds: shifts.map((shift) => shift.id),
        ageCutoffDate,
        applicationsCloseAt,
      }),
    [roles, shifts, ageCutoffDate, applicationsCloseAt],
  );

  const form = useForm<FormInput, unknown, VolunteerApplicationValues>({
    // The select strings are coerced by the schema itself.
    resolver: zodResolver(schema) as never,
    defaultValues: {
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
      emergencyContactName: "",
      emergencyContactPhone: "",
      referralSource: undefined,
      commitmentConsent: false,
      imageConsent: false,
      dataConsent: false,
      website: "",
    },
  });

  const motivation = useWatch({ control: form.control, name: "motivation" });
  const motivationLength = motivation?.length ?? 0;

  /** "Form started" fires once per page load, on the first touch of any field. */
  const startedRef = useRef(false);
  function handleFirstInteraction(event: SyntheticEvent) {
    if (startedRef.current) return;
    const target = event.target as HTMLElement;
    const field =
      target
        .closest("[data-volunteer-field]")
        ?.getAttribute("data-volunteer-field") ?? target.getAttribute("name");
    if (!field || field === "website") return;
    startedRef.current = true;
    captureClientEvent(
      POSTHOG_EVENTS.VOLUNTEER_FORM_STARTED,
      volunteerFormStartedProperties({ festivalId, field }),
    );
  }

  async function onSubmit(values: VolunteerApplicationValues) {
    setIsSubmitting(true);
    try {
      // The raw input, not `values`: the server parses it with the same
      // schema, and the parsed output would not parse again.
      const result = await submitVolunteerApplication(
        festivalId,
        form.getValues(),
      );
      if (result.success) {
        captureClientEvent(
          POSTHOG_EVENTS.VOLUNTEER_FORM_SUBMITTED,
          volunteerFormSubmittedProperties(festivalId, values),
        );
        setOutcome("received");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (result.closed) {
        setOutcome("closed");
        return;
      }
      form.setError("root", { message: result.message });
      toast.error(result.message);
    } catch (error) {
      console.error(error);
      form.setError("root", { message: VOLUNTEER_COPY.genericError });
      toast.error(VOLUNTEER_COPY.genericError);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (outcome === "received") return <VolunteerApplicationReceived />;
  if (outcome === "closed") {
    return (
      <VolunteerCallClosed
        title={VOLUNTEER_COPY.closedTitle}
        message={VOLUNTEER_COPY.closedMessage}
      />
    );
  }

  // The field components are typed for forms whose input and output match.
  const fieldControl = form.control as unknown as Control<FormInput>;
  const roleOptions = roles.map((role) => ({
    value: String(role.id),
    label: role.name,
  }));
  const rootError = form.formState.errors.root?.message;

  return (
    <section className="grid gap-4" id="postular">
      <h2 className="text-2xl font-semibold">Postúlate</h2>
      <Form {...form}>
        <form
          className="grid gap-5"
          noValidate
          onSubmit={form.handleSubmit(onSubmit)}
          onFocusCapture={handleFirstInteraction}
          onPointerDownCapture={handleFirstInteraction}
        >
          <TextInput
            label="Nombre completo"
            name="fullName"
            autoComplete="name"
            required
          />
          <TextInput
            label="Fecha de nacimiento"
            name="birthdate"
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            required
          />
          <div data-volunteer-field="phone">
            <PhoneInput name="phone" label="Celular / WhatsApp" required />
          </div>
          <TextInput
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
          <TextInput
            label="Zona donde vives"
            name="zone"
            placeholder="Ej.: Equipetrol, Plan 3000, Urbarí"
          />

          <FormField
            control={fieldControl}
            name="shiftIds"
            render={({ field }) => (
              <FormItem data-volunteer-field="shiftIds" className="grid gap-2">
                <FormLabel>
                  Turnos disponibles
                  <span className="text-destructive ml-0.5">*</span>
                </FormLabel>
                <FormDescription>
                  Marca todos los turnos que puedes cubrir completos.
                </FormDescription>
                <div className="grid gap-2">
                  {shifts.map((shift) => {
                    const selected = (field.value ?? []) as number[];
                    const checked = selected.includes(shift.id);
                    return (
                      <label
                        key={shift.id}
                        className="flex min-w-0 cursor-pointer items-start gap-3 rounded-md border p-3"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) =>
                            field.onChange(
                              value === true
                                ? [...selected, shift.id]
                                : selected.filter((id) => id !== shift.id),
                            )
                          }
                          className="mt-0.5"
                        />
                        <span className="min-w-0 text-sm break-words">
                          {formatShiftSummary(shift)}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <div data-volunteer-field="firstChoiceRoleId" className="min-w-0">
              <SelectInput
                formControl={fieldControl}
                name="firstChoiceRoleId"
                label="Rol preferido: 1ª opción"
                options={roleOptions}
                placeholder="Elige un rol"
                required
              />
            </div>
            <div data-volunteer-field="secondChoiceRoleId" className="min-w-0">
              <SelectInput
                formControl={fieldControl}
                name="secondChoiceRoleId"
                label="Rol preferido: 2ª opción"
                options={roleOptions}
                placeholder="Elige otro rol"
                required
              />
            </div>
          </div>

          <FormField
            control={fieldControl}
            name="experience"
            render={({ field }) => (
              <FormItem
                data-volunteer-field="experience"
                className="grid gap-2"
              >
                <FormLabel>Experiencia o habilidades</FormLabel>
                <div className="grid gap-2 sm:grid-cols-2">
                  {VOLUNTEER_EXPERIENCE_OPTIONS.map((option) => {
                    const selected = (field.value ?? []) as string[];
                    return (
                      <label
                        key={option.value}
                        className="flex cursor-pointer items-center gap-3 text-sm"
                      >
                        <Checkbox
                          checked={selected.includes(option.value)}
                          onCheckedChange={(value) =>
                            field.onChange(
                              value === true
                                ? [...selected, option.value]
                                : selected.filter((v) => v !== option.value),
                            )
                          }
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          <TextInput
            label="Cuéntanos más sobre tu experiencia (opcional)"
            name="experienceNotes"
          />
          <TextInput
            label={VOLUNTEER_COPY.portfolioLabel}
            name="portfolio"
            description={VOLUNTEER_COPY.portfolioHint}
          />

          <FormField
            control={fieldControl}
            name="motivation"
            render={({ field }) => (
              <FormItem className="grid gap-2">
                <FormLabel>
                  ¿Por qué quieres ser voluntario/a?
                  <span className="text-destructive ml-0.5">*</span>
                </FormLabel>
                <FormControl>
                  <Textarea
                    rows={4}
                    maxLength={VOLUNTEER_MOTIVATION_MAX_LENGTH}
                    {...field}
                  />
                </FormControl>
                <p className="text-right text-xs text-muted-foreground">
                  {motivationLength}/{VOLUNTEER_MOTIVATION_MAX_LENGTH}
                </p>
                <FormMessage />
              </FormItem>
            )}
          />

          <fieldset className="grid gap-4 md:grid-cols-2">
            <legend className="mb-2 font-semibold">
              Contacto de emergencia
            </legend>
            <TextInput label="Nombre" name="emergencyContactName" required />
            <div
              data-volunteer-field="emergencyContactPhone"
              className="min-w-0"
            >
              <PhoneInput
                name="emergencyContactPhone"
                label="Celular"
                required
              />
            </div>
          </fieldset>

          <div data-volunteer-field="referralSource">
            <SelectInput
              formControl={fieldControl}
              name="referralSource"
              label="¿Cómo te enteraste?"
              options={[...VOLUNTEER_REFERRAL_OPTIONS]}
              placeholder="Elige una opción"
              required
            />
          </div>

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
                {...form.register("website")}
              />
            </label>
          </div>

          <ConsentField
            name="commitmentConsent"
            label="Me comprometo a cumplir completos los turnos que me asignen y a asistir a la inducción previa."
          />
          <ConsentField
            name="dataConsent"
            label="Autorizo el uso de mis datos para coordinar el voluntariado."
            note={VOLUNTEER_PRIVACY_NOTICE.replace(
              "{email}",
              SITE_CONTACT_EMAIL,
            )}
          />

          <fieldset className="grid gap-2 rounded-md border p-3">
            <legend className="px-1 font-semibold">
              {VOLUNTEER_COPY.imageConsentTitle}
            </legend>
            <ConsentField
              name="imageConsent"
              label={VOLUNTEER_COPY.imageConsentLabel}
              note={VOLUNTEER_COPY.imageConsentNote}
              optional
            />
          </fieldset>

          {rootError ? (
            <p role="alert" className="text-sm text-destructive break-words">
              {rootError}
            </p>
          ) : null}

          <Button type="submit" wrap disabled={isSubmitting}>
            {isSubmitting ? "Enviando..." : "Enviar postulación"}
          </Button>
        </form>
      </Form>
    </section>
  );
}

function ConsentField({
  name,
  label,
  note,
  optional = false,
}: {
  name: "commitmentConsent" | "imageConsent" | "dataConsent";
  label: string;
  note?: string;
  /** Optional preferences carry no required mark. */
  optional?: boolean;
}) {
  return (
    <FormField
      name={name}
      render={({ field }) => (
        <FormItem data-volunteer-field={name} className="grid gap-2">
          <label className="flex cursor-pointer items-start gap-3">
            <FormControl>
              <Checkbox
                checked={field.value === true}
                onCheckedChange={(value) => field.onChange(value === true)}
                className="mt-0.5"
              />
            </FormControl>
            <span className="min-w-0 text-sm break-words">
              {label}
              {optional ? null : (
                <span className="text-destructive ml-0.5">*</span>
              )}
            </span>
          </label>
          {note ? (
            <p className="text-xs text-muted-foreground break-words wrap-anywhere">
              {note}
            </p>
          ) : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
