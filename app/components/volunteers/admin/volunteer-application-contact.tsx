import { DateTime } from "luxon";
import { MessageCircleIcon, PhoneIcon } from "lucide-react";
import type { ReactNode } from "react";

import { STORE_TIMEZONE } from "@/app/lib/formatters";
import {
  whatsappHref,
  type VolunteerApplicationDetail,
} from "@/app/lib/volunteers/admin-definitions";

const linkClass =
  "inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline focus-visible:underline";

/** "24 años · 3 de mayo de 2002", on La Paz's calendar; the raw value if odd. */
export function formatVolunteerAge(
  birthdate: string,
  today: DateTime = DateTime.now().setZone(STORE_TIMEZONE),
): string {
  const birth = DateTime.fromISO(birthdate, { zone: STORE_TIMEZONE });
  if (!birth.isValid) return birthdate;
  const years = Math.floor(today.diff(birth, "years").years);
  const date = birth.setLocale("es").toFormat("d 'de' LLLL 'de' yyyy");
  return `${years} ${years === 1 ? "año" : "años"} · ${date}`;
}

/** The number, with links to write over WhatsApp and to call it. */
export function VolunteerPhone({
  phone,
  name,
}: {
  phone: string;
  /** Whose number it is, for the links' accessible names. */
  name: string;
}) {
  const whatsapp = whatsappHref(phone);
  const digits = phone.replace(/[^\d+]/g, "");
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="tabular-nums wrap-anywhere">{phone}</span>
      {digits && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
              aria-label={`Escribir por WhatsApp a ${name}`}
            >
              <MessageCircleIcon aria-hidden="true" className="h-4 w-4" />
              WhatsApp
            </a>
          )}
          <a
            href={`tel:${digits}`}
            className={linkClass}
            aria-label={`Llamar a ${name}`}
          >
            <PhoneIcon aria-hidden="true" className="h-4 w-4" />
            Llamar
          </a>
        </div>
      )}
    </div>
  );
}

/** A label over its value, inside a `<dl>`. */
export function VolunteerApplicationField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

/** How to reach the applicant, and whom to call in an emergency. */
export default function VolunteerApplicationContact({
  application,
}: {
  application: Pick<
    VolunteerApplicationDetail,
    | "fullName"
    | "phone"
    | "email"
    | "zone"
    | "birthdate"
    | "emergencyContactName"
    | "emergencyContactPhone"
  >;
}) {
  return (
    <dl className="grid min-w-0 gap-3">
      <VolunteerApplicationField label="Celular">
        <VolunteerPhone phone={application.phone} name={application.fullName} />
      </VolunteerApplicationField>
      <VolunteerApplicationField label="Correo">
        <a
          href={`mailto:${application.email}`}
          className="font-medium text-primary underline-offset-2 wrap-anywhere hover:underline focus-visible:underline"
        >
          {application.email}
        </a>
      </VolunteerApplicationField>
      <VolunteerApplicationField label="Zona">
        {application.zone ? (
          <span className="break-words">{application.zone}</span>
        ) : (
          <span className="text-muted-foreground">No la indicó</span>
        )}
      </VolunteerApplicationField>
      <VolunteerApplicationField label="Edad y fecha de nacimiento">
        {formatVolunteerAge(application.birthdate)}
      </VolunteerApplicationField>
      <VolunteerApplicationField label="Contacto de emergencia">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="break-words">
            {application.emergencyContactName}
          </span>
          <VolunteerPhone
            phone={application.emergencyContactPhone}
            name={application.emergencyContactName}
          />
        </div>
      </VolunteerApplicationField>
    </dl>
  );
}
