import { DateTime } from "luxon";
import { z } from "zod";

import { STORE_TIMEZONE } from "@/app/lib/formatters";
import {
  VOLUNTEER_MAX_SHIFTS_PER_DAY,
  type VolunteerApplicationStatus,
  type VolunteerExperience,
  type VolunteerReferralSource,
} from "@/app/lib/volunteers/definitions";

/**
 * The volunteer admin (/dashboard/festivals/[id]/volunteers): shared types,
 * labels, list filters and the pure rules the actions and the UI both apply.
 * Client-safe: no database, no server-only imports.
 */

export const volunteerAdminPath = (festivalId: number) =>
  `/dashboard/festivals/${festivalId}/volunteers`;
export const volunteerApplicationAdminPath = (
  festivalId: number,
  applicationId: number,
) => `${volunteerAdminPath(festivalId)}/${applicationId}`;
export const volunteerSetupAdminPath = (festivalId: number) =>
  `${volunteerAdminPath(festivalId)}/setup`;

export const VOLUNTEER_APPLICATION_STATUSES = [
  "pending",
  "accepted",
  "waitlist",
  "rejected",
] as const satisfies readonly VolunteerApplicationStatus[];

export const VOLUNTEER_STATUS_LABELS: Record<
  VolunteerApplicationStatus,
  string
> = {
  pending: "Por revisar",
  accepted: "Aceptada",
  waitlist: "En espera",
  rejected: "Rechazada",
};

/** How the admin reads each "Sobre vos" checkbox (third person). */
export const VOLUNTEER_EXPERIENCE_ADMIN_LABELS: Record<
  VolunteerExperience,
  string
> = {
  events: "Eventos",
  customer_service: "Atención al público",
  photography: "Fotografía",
  social_media: "Redes sociales",
  own_camera: "Tiene cámara propia o iPhone",
};

export const VOLUNTEER_REFERRAL_ADMIN_LABELS: Record<
  VolunteerReferralSource,
  string
> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  friends: "Amigos",
  university: "Universidad",
  other: "Otro",
};

export const VOLUNTEER_ADMIN_COPY = {
  portfolioLabel: "Portafolio, CV o enlace a su trabajo",
  imageConsentYes: "Autorizó el uso de su imagen",
  imageConsentNo: "No autorizó el uso de su imagen",
  notesHint: "Solo las ve el equipo.",
  assignmentLocked: "Aceptá la postulación para asignarle un rol y turnos.",
  notAvailableWarning: "No lo marcó como disponible",
  unauthorized: "No tenés permiso para hacer esto.",
  notFound: "No encontramos esa postulación. Actualizá la página.",
  genericError: "No pudimos guardar el cambio. Volvé a intentar.",
} as const;

/** What every admin action answers. */
export type VolunteerAdminResult =
  | { success: true; message: string }
  | { success: false; message: string };

/* ------------------------------------------------------------------ */
/* List filters (URL search params)                                    */
/* ------------------------------------------------------------------ */

export const VOLUNTEER_ADMIN_PAGE_SIZES = [25, 50, 100] as const;

/** Largest Postgres int4; a bigger id would make the query throw (22003). */
export const POSTGRES_INT_MAX = 2_147_483_647;

const optionalId = z.coerce
  .number()
  .int()
  .positive()
  .max(POSTGRES_INT_MAX)
  .optional()
  .catch(undefined);

/** A bad param falls back to its default instead of a 404. */
export const VolunteerApplicationsSearchSchema = z.object({
  status: z
    .enum([...VOLUNTEER_APPLICATION_STATUSES, "all"])
    .catch("pending")
    .default("pending"),
  /** Cut, not dropped: an over-long search still filters by its start. */
  query: z
    .string()
    .trim()
    .transform((value) => value.slice(0, 200))
    .catch("")
    .default(""),
  roleId: optionalId,
  shiftId: optionalId,
  limit: z.coerce
    .number()
    .int()
    .refine((value) =>
      (VOLUNTEER_ADMIN_PAGE_SIZES as readonly number[]).includes(value),
    )
    .catch(25)
    .default(25),
  offset: z.coerce.number().int().min(0).catch(0).default(0),
});

export type VolunteerApplicationsFilters = z.output<
  typeof VolunteerApplicationsSearchSchema
>;

/* ------------------------------------------------------------------ */
/* Shapes the admin queries return                                     */
/* ------------------------------------------------------------------ */

export type VolunteerAdminRole = {
  id: number;
  name: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
};

export type VolunteerAdminShift = {
  id: number;
  label: string;
  startsAt: Date;
  endsAt: Date;
  neededHeadcount: number;
  sortOrder: number;
  isActive: boolean;
};

/** A shift with how full it is. */
export type VolunteerShiftCoverage = VolunteerAdminShift & {
  /** Applications (any status but rejected) that marked it as available. */
  availableCount: number;
  /** Accepted applications assigned to it. */
  assignedCount: number;
};

export type VolunteerAdminCall = {
  festival: { id: number; name: string };
  /** Null until the call is configured for this festival. */
  settings: {
    applicationsCloseAt: Date;
    /** yyyy-MM-dd */
    inductionDate: string | null;
    /** "HH:mm:ss" */
    inductionTime: string | null;
  } | null;
  roles: VolunteerAdminRole[];
  shifts: VolunteerShiftCoverage[];
};

export type VolunteerApplicationListItem = {
  id: number;
  fullName: string;
  email: string;
  phone: string;
  status: VolunteerApplicationStatus;
  firstChoiceRoleName: string;
  secondChoiceRoleName: string;
  assignedRoleName: string | null;
  availableShiftCount: number;
  assignedShiftCount: number;
  createdAt: Date;
};

export type VolunteerApplicationsPage = {
  items: VolunteerApplicationListItem[];
  total: number;
  /** Per status, ignoring the status filter but applying the others. */
  counts: Record<VolunteerApplicationStatus, number> & { all: number };
};

export type VolunteerApplicationDetail = {
  id: number;
  festivalId: number;
  fullName: string;
  /** yyyy-MM-dd */
  birthdate: string;
  phone: string;
  email: string;
  zone: string | null;
  firstChoiceRoleId: number;
  secondChoiceRoleId: number;
  experience: string[];
  experienceNotes: string | null;
  portfolio: string | null;
  motivation: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  referralSource: VolunteerReferralSource;
  consentedAt: Date;
  privacyNoticeVersion: string;
  imageConsent: boolean;
  status: VolunteerApplicationStatus;
  assignedRoleId: number | null;
  adminNotes: string | null;
  availableShiftIds: number[];
  assignedShiftIds: number[];
  reviewedBy: { id: number; displayName: string } | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

/** Roles and shifts are assigned only once the application is accepted. */
export function canAssignVolunteer(status: VolunteerApplicationStatus) {
  return status === "accepted";
}

/**
 * La Paz days on which `shifts` holds more than VOLUNTEER_MAX_SHIFTS_PER_DAY,
 * as yyyy-MM-dd; empty when the selection respects the limit.
 */
export function daysOverShiftLimit(
  shifts: ReadonlyArray<{ startsAt: Date }>,
  max = VOLUNTEER_MAX_SHIFTS_PER_DAY,
): string[] {
  const perDay = new Map<string, number>();
  for (const shift of shifts) {
    const day = DateTime.fromJSDate(shift.startsAt, {
      zone: STORE_TIMEZONE,
    }).toISODate();
    if (day) perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  return [...perDay.entries()]
    .filter(([, count]) => count > max)
    .map(([day]) => day)
    .sort();
}

/** "https://wa.me/59171234567" from "+591 7123-4567"; null without digits. */
export function whatsappHref(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}
