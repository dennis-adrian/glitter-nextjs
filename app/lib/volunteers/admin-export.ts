import { DateTime } from "luxon";

import { STORE_TIMEZONE } from "@/app/lib/formatters";
import { serializeCsvRows } from "@/app/lib/orders/csv";
import {
  ageOn,
  VOLUNTEER_ADMIN_COPY,
  VOLUNTEER_EXPERIENCE_ADMIN_LABELS,
  VOLUNTEER_REFERRAL_ADMIN_LABELS,
  VOLUNTEER_STATUS_LABELS,
} from "@/app/lib/volunteers/admin-definitions";
import type {
  VolunteerApplicationStatus,
  VolunteerReferralSource,
} from "@/app/lib/volunteers/definitions";
import { formatShiftWhen } from "@/app/lib/volunteers/format";

/**
 * The volunteer list as a spreadsheet: one row per application, every answer
 * and the admin's decision, in Spanish. Pure: the export route fetches the
 * rows (fetchVolunteerApplicationsForExport) and serializes them here.
 * Cells go through the repo's CSV serializer, which quotes every cell and
 * neutralizes formulas (=, +, -, @) with a leading apostrophe.
 */

export type VolunteerExportShift = {
  id: number;
  label: string;
  startsAt: Date;
  endsAt: Date;
};

export type VolunteerExportApplication = {
  id: number;
  fullName: string;
  status: VolunteerApplicationStatus;
  phone: string;
  email: string;
  /** yyyy-MM-dd */
  birthdate: string;
  zone: string | null;
  firstChoiceRoleName: string;
  secondChoiceRoleName: string;
  assignedRoleName: string | null;
  availableShiftIds: number[];
  assignedShiftIds: number[];
  experience: string[];
  experienceNotes: string | null;
  portfolio: string | null;
  motivation: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  referralSource: VolunteerReferralSource;
  imageConsent: boolean;
  adminNotes: string | null;
  createdAt: Date;
};

export type VolunteerExport = {
  festival: { id: number; name: string };
  /** Every shift of the festival (active or not), chronological. */
  shifts: VolunteerExportShift[];
  /** Newest first, like the list. */
  applications: VolunteerExportApplication[];
};

export const VOLUNTEER_EXPORT_HEADER = [
  "Nombre",
  "Estado",
  "Celular",
  "Correo",
  "Fecha de nacimiento",
  "Edad",
  "Zona",
  "1ª opción",
  "2ª opción",
  "Turnos disponibles",
  "Rol asignado",
  "Turnos asignados",
  "Experiencia",
  "Otra experiencia",
  "Portafolio",
  "¿Por qué?",
  "Contacto de emergencia",
  "Celular de emergencia",
  "Cómo se enteró",
  "Uso de imagen",
  "Postuló el",
  "Notas internas",
] as const;

/** "Vie 18 dic · 15:00–19:00 (Montaje); Sáb 19 dic · …", chronological. */
function shiftList(ids: readonly number[], shifts: VolunteerExportShift[]) {
  const wanted = new Set(ids);
  return shifts
    .filter((shift) => wanted.has(shift.id))
    .map((shift) => `${formatShiftWhen(shift)} (${shift.label})`)
    .join("; ");
}

/** "10/05/2000" from "2000-05-10". */
function dayMonthYear(isoDate: string) {
  const date = DateTime.fromISO(isoDate);
  return date.isValid ? date.toFormat("dd/MM/yyyy") : isoDate;
}

/** The CSV body (no BOM), header first. `today` fixes the ages. */
export function serializeVolunteerExportCsv(
  data: VolunteerExport,
  today: Date = new Date(),
): string {
  const rows = data.applications.map((application) => [
    application.fullName,
    VOLUNTEER_STATUS_LABELS[application.status],
    application.phone,
    application.email,
    dayMonthYear(application.birthdate),
    ageOn(application.birthdate, today),
    application.zone ?? "",
    application.firstChoiceRoleName,
    application.secondChoiceRoleName,
    shiftList(application.availableShiftIds, data.shifts),
    application.assignedRoleName ?? "",
    shiftList(application.assignedShiftIds, data.shifts),
    application.experience
      .map(
        (key) =>
          VOLUNTEER_EXPERIENCE_ADMIN_LABELS[
            key as keyof typeof VOLUNTEER_EXPERIENCE_ADMIN_LABELS
          ] ?? key,
      )
      .join(", "),
    application.experienceNotes ?? "",
    application.portfolio ?? "",
    application.motivation,
    application.emergencyContactName,
    application.emergencyContactPhone,
    VOLUNTEER_REFERRAL_ADMIN_LABELS[application.referralSource] ??
      application.referralSource,
    application.imageConsent
      ? VOLUNTEER_ADMIN_COPY.imageConsentYes
      : VOLUNTEER_ADMIN_COPY.imageConsentNo,
    DateTime.fromJSDate(application.createdAt, {
      zone: STORE_TIMEZONE,
    }).toFormat("dd/MM/yyyy HH:mm"),
    application.adminNotes ?? "",
  ]);
  return serializeCsvRows([VOLUNTEER_EXPORT_HEADER, ...rows]);
}

/**
 * "voluntarios-glitter-diciembre-2026-2026-11-21.csv": the festival's name
 * as an ASCII slug (safe in a Content-Disposition header), or its id when the
 * name has no letters or digits, and today's La Paz date.
 */
export function volunteerExportFilename(
  festival: { id: number; name: string },
  today: Date = new Date(),
): string {
  const slug = festival.name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  const day = DateTime.fromJSDate(today, { zone: STORE_TIMEZONE }).toISODate();
  return `voluntarios-${slug || festival.id}-${day}.csv`;
}
