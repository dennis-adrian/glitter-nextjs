import { DateTime } from "luxon";

import { VolunteerApplicationField as Field } from "@/app/components/volunteers/admin/volunteer-application-contact";
import { formatDisplayDate } from "@/app/lib/formatters";
import {
  VOLUNTEER_ADMIN_COPY,
  VOLUNTEER_EXPERIENCE_ADMIN_LABELS,
  VOLUNTEER_REFERRAL_ADMIN_LABELS,
  type VolunteerAdminRole,
  type VolunteerAdminShift,
  type VolunteerApplicationDetail,
} from "@/app/lib/volunteers/admin-definitions";
import { formatShiftWhen } from "@/app/lib/volunteers/format";

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function roleName(roles: VolunteerAdminRole[], id: number) {
  const role = roles.find((candidate) => candidate.id === id);
  if (!role) return `Rol #${id}`;
  return role.isActive ? role.name : `${role.name} (inactivo)`;
}

function experienceLabel(value: string) {
  return (
    VOLUNTEER_EXPERIENCE_ADMIN_LABELS[
      value as keyof typeof VOLUNTEER_EXPERIENCE_ADMIN_LABELS
    ] ?? value
  );
}

const muted = (text: string) => (
  <span className="text-muted-foreground">{text}</span>
);

/** What the applicant answered in the form, as the team reads it. */
export default function VolunteerApplicationAnswers({
  application,
  roles,
  shifts,
}: {
  application: Pick<
    VolunteerApplicationDetail,
    | "firstChoiceRoleId"
    | "secondChoiceRoleId"
    | "availableShiftIds"
    | "experience"
    | "experienceNotes"
    | "portfolio"
    | "motivation"
    | "referralSource"
    | "imageConsent"
    | "consentedAt"
    | "privacyNoticeVersion"
  >;
  roles: VolunteerAdminRole[];
  shifts: VolunteerAdminShift[];
}) {
  const available = shifts
    .filter((shift) => application.availableShiftIds.includes(shift.id))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const portfolio = application.portfolio;

  return (
    <dl className="grid min-w-0 gap-3">
      <Field label="1ª opción de rol">
        <span className="break-words">
          {roleName(roles, application.firstChoiceRoleId)}
        </span>
      </Field>
      <Field label="2ª opción de rol">
        <span className="break-words">
          {roleName(roles, application.secondChoiceRoleId)}
        </span>
      </Field>
      <Field label="Turnos disponibles">
        {available.length === 0 ? (
          muted("No marcó turnos")
        ) : (
          <ul className="space-y-0.5">
            {available.map((shift) => (
              <li key={shift.id} className="break-words">
                <span className="tabular-nums">{formatShiftWhen(shift)}</span>
                {" — "}
                {shift.label}
                {!shift.isActive && muted(" (inactivo)")}
              </li>
            ))}
          </ul>
        )}
      </Field>
      <Field label="Experiencia">
        {application.experience.length === 0 ? (
          muted("No marcó ninguna")
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {application.experience.map((value) => (
              <li
                key={value}
                className="rounded-full bg-muted px-2 py-0.5 text-xs break-words"
              >
                {experienceLabel(value)}
              </li>
            ))}
          </ul>
        )}
      </Field>
      {application.experienceNotes && (
        <Field label="Sobre su experiencia">
          <p className="break-words whitespace-pre-line">
            {application.experienceNotes}
          </p>
        </Field>
      )}
      <Field label={VOLUNTEER_ADMIN_COPY.portfolioLabel}>
        {!portfolio ? (
          muted("No compartió ninguno")
        ) : isHttpUrl(portfolio) ? (
          <a
            href={portfolio}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline-offset-2 wrap-anywhere hover:underline focus-visible:underline"
          >
            {portfolio}
          </a>
        ) : (
          <span className="wrap-anywhere">{portfolio}</span>
        )}
      </Field>
      <Field label="Motivación">
        <p className="break-words whitespace-pre-line">
          {application.motivation}
        </p>
      </Field>
      <Field label="Cómo se enteró">
        {VOLUNTEER_REFERRAL_ADMIN_LABELS[application.referralSource] ??
          application.referralSource}
      </Field>
      <Field label="Uso de imagen">
        {application.imageConsent
          ? VOLUNTEER_ADMIN_COPY.imageConsentYes
          : VOLUNTEER_ADMIN_COPY.imageConsentNo}
      </Field>
      <Field label="Consentimiento de datos">
        <span className="break-words">
          {formatDisplayDate(application.consentedAt, DateTime.DATETIME_MED)}
          {" · "}
          aviso de privacidad {application.privacyNoticeVersion}
        </span>
      </Field>
    </dl>
  );
}
