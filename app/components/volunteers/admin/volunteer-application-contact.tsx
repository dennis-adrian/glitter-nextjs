import { DateTime } from "luxon";
import { PhoneIcon } from "lucide-react";
import type { ReactNode } from "react";

import BrandIcon from "@/app/components/brand-icon";
import { Badge } from "@/app/components/ui/badge";
import { STORE_TIMEZONE } from "@/app/lib/formatters";
import {
  VOLUNTEER_ADMIN_COPY,
  ageOn,
  whatsappHref,
  type VolunteerApplicationDetail,
} from "@/app/lib/volunteers/admin-definitions";
import { formatYears } from "@/app/lib/volunteers/format";

const linkClass =
  "font-medium text-primary underline-offset-2 hover:underline focus-visible:underline";

/** "03/05/2002 · 24 años" on La Paz's calendar; the raw value if odd. */
export function formatVolunteerBirthdate(
  birthdate: string,
  today: Date = new Date(),
): string {
  const birth = DateTime.fromISO(birthdate, { zone: STORE_TIMEZONE });
  if (!birth.isValid) return birthdate;
  return `${birth.toFormat("dd/MM/yyyy")} · ${formatYears(ageOn(birthdate, today))}`;
}

/** Icon links to write over WhatsApp and to call a number. */
function PhoneLinks({ phone, name }: { phone: string; name: string }) {
  const whatsapp = whatsappHref(phone);
  const dial = phone.replace(/[^\d+]/g, "");
  if (!dial) return null;
  const iconLink =
    "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-primary hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:size-8";
  return (
    <span className="inline-flex shrink-0 items-center">
      {whatsapp && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className={iconLink}
          aria-label={`Escribir por WhatsApp a ${name}`}
        >
          <BrandIcon brand="whatsapp" />
        </a>
      )}
      <a
        href={`tel:${dial}`}
        className={iconLink}
        aria-label={`Llamar a ${name}`}
      >
        <PhoneIcon aria-hidden="true" className="h-4 w-4" />
      </a>
    </span>
  );
}

/** A muted label over its value, inside a `<dl>`. */
export function VolunteerApplicationField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

/**
 * The "Contacto" card's body: how to reach the applicant, whom to call in an
 * emergency, and what they consented to.
 */
export default function VolunteerApplicationContact({
  application,
  today,
}: {
  application: Pick<
    VolunteerApplicationDetail,
    | "fullName"
    | "phone"
    | "email"
    | "birthdate"
    | "portfolio"
    | "emergencyContactName"
    | "emergencyContactPhone"
    | "imageConsent"
    | "consentedAt"
    | "privacyNoticeVersion"
  >;
  /** "Now", for the age; stories pin it. */
  today?: Date;
}) {
  const { portfolio } = application;
  const consentedAt = DateTime.fromJSDate(application.consentedAt, {
    zone: STORE_TIMEZONE,
  }).toFormat("dd/MM/yyyy HH:mm");

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <dl className="grid min-w-0 gap-4 sm:grid-cols-[repeat(auto-fit,minmax(13.75rem,1fr))]">
        <VolunteerApplicationField label="Celular / WhatsApp">
          <span className="flex min-w-0 items-center gap-1">
            <span className="min-w-0 tabular-nums wrap-anywhere">
              {application.phone}
            </span>
            <PhoneLinks phone={application.phone} name={application.fullName} />
          </span>
        </VolunteerApplicationField>
        <VolunteerApplicationField label="Correo">
          <a
            href={`mailto:${application.email}`}
            className={`${linkClass} wrap-anywhere`}
          >
            {application.email}
          </a>
        </VolunteerApplicationField>
        <VolunteerApplicationField label="Fecha de nacimiento">
          <span className="tabular-nums">
            {formatVolunteerBirthdate(application.birthdate, today)}
          </span>
        </VolunteerApplicationField>
        <VolunteerApplicationField label={VOLUNTEER_ADMIN_COPY.portfolioLabel}>
          {!portfolio ? (
            <span className="text-muted-foreground">—</span>
          ) : isHttpUrl(portfolio) ? (
            <a
              href={portfolio}
              target="_blank"
              rel="noopener noreferrer"
              className={`${linkClass} wrap-anywhere`}
            >
              {portfolio}
            </a>
          ) : (
            <span className="wrap-anywhere">{portfolio}</span>
          )}
        </VolunteerApplicationField>
        <VolunteerApplicationField label="Contacto de emergencia">
          <span className="flex min-w-0 items-center gap-1">
            <span className="min-w-0 break-words">
              {application.emergencyContactName}
              {" · "}
              <span className="whitespace-nowrap tabular-nums">
                {application.emergencyContactPhone}
              </span>
            </span>
            <PhoneLinks
              phone={application.emergencyContactPhone}
              name={application.emergencyContactName}
            />
          </span>
        </VolunteerApplicationField>
        <VolunteerApplicationField
          label={VOLUNTEER_ADMIN_COPY.imageConsentLabel}
        >
          <Badge
            variant={application.imageConsent ? "green" : "red"}
            className="mt-0.5"
          >
            {application.imageConsent
              ? VOLUNTEER_ADMIN_COPY.imageConsentYes
              : VOLUNTEER_ADMIN_COPY.imageConsentNo}
          </Badge>
        </VolunteerApplicationField>
      </dl>
      <p className="text-xs break-words text-muted-foreground">
        Aceptó el aviso de privacidad {application.privacyNoticeVersion} el{" "}
        {consentedAt}.
      </p>
    </div>
  );
}
