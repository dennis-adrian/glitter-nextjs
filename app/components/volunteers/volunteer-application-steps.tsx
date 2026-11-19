"use client";

import { useFormContext, useWatch } from "react-hook-form";

import {
  ChoiceRow,
  PhoneField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/app/components/volunteers/volunteer-form-fields";
import { FormField, FormItem } from "@/app/components/ui/form";
import {
  VOLUNTEER_COPY,
  VOLUNTEER_EXPERIENCE_OPTIONS,
  VOLUNTEER_MOTIVATION_MAX_LENGTH,
  VOLUNTEER_MOTIVATION_MIN_LENGTH,
  VOLUNTEER_PRIVACY_NOTICE,
  VOLUNTEER_REFERRAL_OPTIONS,
  type VolunteerRole,
  type VolunteerShift,
  VOLUNTEERS_EMAIL,
} from "@/app/lib/volunteers/definitions";
import type { VolunteerDraftValues } from "@/app/lib/volunteers/draft";
import {
  formatShiftWhen,
  formatShiftWhenShort,
} from "@/app/lib/volunteers/format";
import { formatCutoffDate } from "@/app/lib/volunteers/schema";

/**
 * The fields of each step of /voluntarios/postular. They read and write the
 * one form the wizard owns (useFormContext), so going back loses nothing.
 */

export type VolunteerFormValues = VolunteerDraftValues & { website: string };

const legendClassName =
  "mb-1 p-0 font-display text-xl leading-7 font-bold text-brand-ink";
const hintClassName = "text-sm leading-5 text-muted-foreground";

function RequiredMark() {
  return (
    <span className="ml-0.5 text-destructive" aria-hidden>
      *
    </span>
  );
}

export function PersonalStep({ ageCutoffDate }: { ageCutoffDate: string }) {
  return (
    <div className="flex flex-col gap-5">
      <TextField
        name="fullName"
        label="Nombre completo"
        autoComplete="name"
        required
      />
      <TextField
        name="birthdate"
        label="Fecha de nacimiento"
        type="date"
        autoComplete="bday"
        max={ageCutoffDate}
        hint={`Tenés que ser mayor de 18 años al ${formatCutoffDate(ageCutoffDate)}.`}
        required
      />
      <PhoneField name="phone" label="Celular / WhatsApp" required />
      <TextField
        name="email"
        label="Correo"
        type="email"
        inputMode="email"
        autoComplete="email"
        hint="Ahí te enviamos el resumen de tu postulación."
        required
      />
      <TextField
        name="zone"
        label="Zona donde vivís"
        placeholder="Barrio o zona de la ciudad"
        hint="Opcional. Nos ayuda a organizar los turnos que terminan de noche."
      />
    </div>
  );
}

export function ShiftsAndRolesStep({
  shifts,
  roles,
}: {
  shifts: VolunteerShift[];
  roles: VolunteerRole[];
}) {
  const roleOptions = roles.map((role) => ({
    value: String(role.id),
    label: role.name,
  }));
  return (
    <div className="flex flex-col gap-7">
      <FormField
        name="shiftIds"
        render={({ field, fieldState }) => {
          const selected = (field.value ?? []) as number[];
          const errorId = "volunteer-shifts-error";
          return (
            <FormItem className="min-w-0">
              <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
                <legend className={legendClassName}>
                  ¿Qué turnos podés cubrir?
                  <RequiredMark />
                </legend>
                <p className={`${hintClassName} mb-2`}>
                  Marcá todos los que puedas, al menos uno. Cada turno dura 4
                  horas y te asignamos como máximo dos por día.
                </p>
                <div className="grid gap-2 lg:grid-cols-2">
                  {shifts.map((shift, index) => (
                    <ChoiceRow
                      key={shift.id}
                      id={index === 0 ? "volunteer-shift-first" : undefined}
                      checked={selected.includes(shift.id)}
                      invalid={Boolean(fieldState.error)}
                      describedBy={fieldState.error ? errorId : undefined}
                      onCheckedChange={(checked) =>
                        field.onChange(
                          checked
                            ? [...selected, shift.id]
                            : selected.filter((id) => id !== shift.id),
                        )
                      }
                    >
                      <strong className="font-semibold">
                        {formatShiftWhen(shift)}
                      </strong>
                      <br />
                      {shift.label}
                    </ChoiceRow>
                  ))}
                </div>
                {fieldState.error ? (
                  <p
                    id={errorId}
                    className="text-sm font-medium text-destructive"
                  >
                    {fieldState.error.message}
                  </p>
                ) : null}
              </fieldset>
            </FormItem>
          );
        }}
      />

      <fieldset className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        <legend className={legendClassName}>¿En qué te gustaría ayudar?</legend>
        <p className={hintClassName}>
          Elegí dos roles distintos, en orden de preferencia.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <SelectField
            name="firstChoiceRoleId"
            label="1ª opción"
            options={roleOptions}
            required
          />
          <SelectField
            name="secondChoiceRoleId"
            label="2ª opción"
            options={roleOptions}
            required
          />
        </div>
      </fieldset>
    </div>
  );
}

export function AboutYouStep() {
  return (
    <div className="flex flex-col gap-6">
      <TextAreaField
        name="motivation"
        label="¿Por qué querés ser voluntario/a?"
        minLength={VOLUNTEER_MOTIVATION_MIN_LENGTH}
        maxLength={VOLUNTEER_MOTIVATION_MAX_LENGTH}
        required
      />
      <FormField
        name="experience"
        render={({ field }) => {
          const selected = (field.value ?? []) as string[];
          return (
            <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
              <legend className="mb-1 p-0 text-sm font-medium text-muted-foreground">
                Experiencia y habilidades
              </legend>
              {VOLUNTEER_EXPERIENCE_OPTIONS.map((option) => {
                const id = `volunteer-experience-${option.value}`;
                return (
                  <label
                    key={option.value}
                    htmlFor={id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"
                  >
                    <input
                      id={id}
                      type="checkbox"
                      className="size-4 flex-none accent-primary"
                      checked={selected.includes(option.value)}
                      onChange={(event) =>
                        field.onChange(
                          event.target.checked
                            ? [...selected, option.value]
                            : selected.filter(
                                (value) => value !== option.value,
                              ),
                        )
                      }
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </fieldset>
          );
        }}
      />
      <TextField name="experienceNotes" label="Otra experiencia o habilidad" />
      <TextField
        name="portfolio"
        label={VOLUNTEER_COPY.portfolioLabel}
        type="url"
        inputMode="url"
        autoComplete="url"
        placeholder={VOLUNTEER_COPY.portfolioPlaceholder}
        hint={VOLUNTEER_COPY.portfolioHint}
      />
      <SelectField
        name="referralSource"
        label="¿Cómo te enteraste?"
        options={VOLUNTEER_REFERRAL_OPTIONS}
        required
      />
    </div>
  );
}

export function LastStep({
  festivalName,
  induction,
  shifts,
  roles,
  onEditStep,
}: {
  festivalName: string;
  /** "sábado 5 de diciembre", or null while it is not set. */
  induction: string | null;
  shifts: VolunteerShift[];
  roles: VolunteerRole[];
  onEditStep: (step: number) => void;
}) {
  const { control, formState, register } =
    useFormContext<VolunteerFormValues>();
  const commitmentsError =
    formState.errors.commitmentConsent?.message ??
    formState.errors.dataConsent?.message;
  const commitmentsErrorId = "volunteer-commitments-error";

  return (
    <div className="flex flex-col gap-7">
      <fieldset className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        <legend className={legendClassName}>Contacto de emergencia</legend>
        <p className={hintClassName}>
          Una persona a quien avisar si pasa algo durante tu turno.
        </p>
        <TextField name="emergencyContactName" label="Nombre" required />
        <PhoneField name="emergencyContactPhone" label="Celular" required />
      </fieldset>

      <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
        <legend className={`${legendClassName} mb-3`}>
          {VOLUNTEER_COPY.commitmentsTitle}
          <RequiredMark />
        </legend>
        <FormField
          control={control}
          name="commitmentConsent"
          render={({ field, fieldState }) => (
            <ChoiceRow
              checked={field.value === true}
              onCheckedChange={field.onChange}
              invalid={Boolean(fieldState.error)}
              describedBy={fieldState.error ? commitmentsErrorId : undefined}
            >
              Me comprometo a cumplir completos los turnos que me asignen y a
              asistir a la inducción {induction ? `del ${induction}` : "previa"}
              .
            </ChoiceRow>
          )}
        />
        <FormField
          control={control}
          name="dataConsent"
          render={({ field, fieldState }) => (
            <ChoiceRow
              checked={field.value === true}
              onCheckedChange={field.onChange}
              invalid={Boolean(fieldState.error)}
              describedBy={fieldState.error ? commitmentsErrorId : undefined}
            >
              {VOLUNTEER_COPY.dataConsentLabel}
            </ChoiceRow>
          )}
        />
        {commitmentsError ? (
          <p
            id={commitmentsErrorId}
            className="text-sm font-medium text-destructive"
          >
            {commitmentsError}
          </p>
        ) : null}

        <p className="mt-4 text-sm font-medium text-muted-foreground">
          {VOLUNTEER_COPY.imageConsentTitle}
        </p>
        <FormField
          control={control}
          name="imageConsent"
          render={({ field }) => (
            <ChoiceRow
              checked={field.value === true}
              onCheckedChange={field.onChange}
            >
              {VOLUNTEER_COPY.imageConsentLabel}
              <br />
              <span className="text-muted-foreground">
                {VOLUNTEER_COPY.imageConsentNote}
              </span>
            </ChoiceRow>
          )}
        />
        <p className="mt-2 text-xs leading-4 wrap-anywhere text-muted-foreground">
          {VOLUNTEER_PRIVACY_NOTICE.replace("{festival}", festivalName).replace(
            "{email}",
            VOLUNTEERS_EMAIL,
          )}
        </p>
      </fieldset>

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

      <ReviewSummary shifts={shifts} roles={roles} onEditStep={onEditStep} />
    </div>
  );
}

function ReviewSummary({
  shifts,
  roles,
  onEditStep,
}: {
  shifts: VolunteerShift[];
  roles: VolunteerRole[];
  onEditStep: (step: number) => void;
}) {
  const [phone, shiftIds, first, second] = useWatch<
    VolunteerFormValues,
    ["phone", "shiftIds", "firstChoiceRoleId", "secondChoiceRoleId"]
  >({ name: ["phone", "shiftIds", "firstChoiceRoleId", "secondChoiceRoleId"] });
  const chosenShifts = shifts.filter((shift) => shiftIds?.includes(shift.id));
  const roleName = (id: string) =>
    roles.find((role) => String(role.id) === id)?.name ?? "—";

  const rows = [
    {
      label: "Celular / WhatsApp",
      value: phone || "—",
      step: 0,
      editLabel: "Cambiar celular",
    },
    {
      label: "Turnos",
      value:
        chosenShifts.length > 0
          ? chosenShifts.map((shift) => (
              <span key={shift.id} className="block">
                {formatShiftWhenShort(shift)}
              </span>
            ))
          : "—",
      step: 1,
      editLabel: "Cambiar turnos",
    },
    {
      label: "Roles",
      value: (
        <>
          <span className="block">1ª {roleName(first)}</span>
          <span className="block">2ª {roleName(second)}</span>
        </>
      ),
      step: 1,
      editLabel: "Cambiar roles",
    },
  ];

  return (
    <section
      aria-labelledby="volunteer-review-title"
      className="flex flex-col gap-3 rounded-[20px] border border-brand-border bg-brand-card p-4"
    >
      <h3
        id="volunteer-review-title"
        className="font-display text-lg leading-7 font-bold text-brand-ink"
      >
        Revisá antes de enviar
      </h3>
      {rows.map((row, index) => (
        <div key={row.label} className="flex flex-col gap-3">
          {index > 0 ? <div className="border-t border-brand-border" /> : null}
          <div className="flex items-start justify-between gap-3 text-sm leading-5">
            <div className="min-w-0">
              <div className="text-muted-foreground">{row.label}</div>
              <div className="font-semibold break-words text-brand-neutral-strong">
                {row.value}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onEditStep(row.step)}
              aria-label={row.editLabel}
              className="inline-flex min-h-11 flex-none items-center px-1 font-semibold text-brand-primary hover:underline"
            >
              Cambiar
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
