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
/** One shift's screen: who is assigned to it and who could cover it. */
export const volunteerShiftAdminPath = (festivalId: number, shiftId: number) =>
  `${volunteerAdminPath(festivalId)}/shifts/${shiftId}`;

/**
 * The shift screen's "Asignar" on a pending or waitlisted application also
 * accepts it. Set to false to require accepting it first (the action then
 * refuses with VOLUNTEER_ADMIN_COPY.assignmentLocked).
 */
export const VOLUNTEER_ASSIGN_AUTO_ACCEPTS: boolean = true;

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
  pending: "Pendiente",
  accepted: "Aceptada",
  waitlist: "En espera",
  rejected: "No aceptada",
};

/** The list's status chips and stat tiles, in their order. */
export const VOLUNTEER_STATUS_FILTERS = [
  "all",
  "pending",
  "accepted",
  "waitlist",
  "rejected",
] as const;
export type VolunteerStatusFilter = (typeof VOLUNTEER_STATUS_FILTERS)[number];

export const VOLUNTEER_STATUS_FILTER_LABELS: Record<
  VolunteerStatusFilter,
  string
> = {
  all: "Todas",
  pending: "Pendientes",
  accepted: "Aceptadas",
  waitlist: "En espera",
  rejected: "No aceptadas",
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

/** Admin copy, as the mockups (canvas "Admin" page) word it. */
export const VOLUNTEER_ADMIN_COPY = {
  portfolioLabel: "Portafolio, CV o enlace a su trabajo",
  imageConsentLabel: "Uso de su imagen en fotos y videos",
  imageConsentYes: "Autorizó",
  imageConsentNo: "No autorizó",
  noAutomaticNotice:
    "La persona no recibe aviso automático: escribile por WhatsApp.",
  notesPlaceholder: "Solo las ve el equipo de Glitter",
  assignmentLocked: "Aceptá la postulación para asignarle un rol y turnos.",
  notMarked: "no marcó este turno",
  unassigned: "Sin asignar",
  unauthorized: "No tenés permiso para hacer esto.",
  notFound: "No encontramos esa postulación. Actualizá la página.",
  genericError: "No pudimos guardar el cambio. Volvé a intentar.",
  staleReview:
    "Alguien más cambió esta postulación. Actualizá la página para ver los cambios.",
} as const;

/** What every admin action answers. */
/**
 * A write's answer. A success may carry a `warning` (already a full sentence,
 * the message included) when the admin went past a recommendation, such as
 * more than VOLUNTEER_MAX_SHIFTS_PER_DAY for someone on a day: shown instead
 * of the message.
 */
export type VolunteerAdminResult =
  | { success: true; message: string; warning?: string }
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
  status: z.enum(VOLUNTEER_STATUS_FILTERS).catch("all").default("all"),
  /** Cut, not dropped: an over-long search still filters by its start. */
  query: z
    .string()
    .trim()
    .transform((value) => value.slice(0, 200))
    .catch("")
    .default(""),
  /** "Rol preferido": the application's 1st or 2nd choice. */
  roleId: optionalId,
  /** "Turno disponible": a shift the applicant marked. */
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
  /** Applications (any status) that named it as their 1st or 2nd choice. */
  choiceCount: number;
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
  /**
   * Applications (any status but rejected) that marked it and are not
   * assigned to it, whatever their status: the shift screen's candidates,
   * the people who can still fill it.
   */
  unassignedAvailableCount: number;
};

/** Someone assigned to a shift, whatever their status. */
export type VolunteerShiftAssignee = {
  applicationId: number;
  fullName: string;
  /** Only accepted ones count toward the coverage. */
  status: VolunteerApplicationStatus;
  assignedRoleName: string | null;
};

/** Someone who marked a shift, is not assigned to it and is not rejected. */
export type VolunteerShiftCandidate = {
  applicationId: number;
  fullName: string;
  status: Exclude<VolunteerApplicationStatus, "rejected">;
  firstChoiceRoleName: string;
  secondChoiceRoleName: string;
  /** Other shifts they are assigned to on this shift's La Paz day. */
  shiftsThatDay: number;
};

/** The shift screen. */
export type VolunteerShiftDetail = {
  festival: { id: number; name: string };
  /** The same numbers VolunteerAdminCall.shifts gives for it. */
  shift: VolunteerShiftCoverage;
  /** By name. */
  assignees: VolunteerShiftAssignee[];
  /** Accepted, then pending, then waitlisted; by name within each. */
  candidates: VolunteerShiftCandidate[];
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
  /** Applications per status, with no filter: the list's stat tiles. */
  statusTotals: Record<VolunteerApplicationStatus, number> & { all: number };
};

export type VolunteerApplicationListItem = {
  id: number;
  fullName: string;
  email: string;
  phone: string;
  /** yyyy-MM-dd */
  birthdate: string;
  status: VolunteerApplicationStatus;
  firstChoiceRoleId: number;
  secondChoiceRoleId: number;
  assignedRoleId: number | null;
  firstChoiceRoleName: string;
  secondChoiceRoleName: string;
  assignedRoleName: string | null;
  /** Ascending ids; resolve them against VolunteerAdminCall.shifts. */
  availableShiftIds: number[];
  assignedShiftIds: number[];
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

export type VolunteerShiftAssignmentDecision =
  | { kind: "assign"; accept: boolean }
  | { kind: "refuse"; message: string };

export const VOLUNTEER_ASSIGN_REJECTED_MESSAGE =
  "No se puede asignar una postulación no aceptada.";

/**
 * Whether the shift screen's "Asignar" may assign an application with this
 * status, and whether it also accepts it (pending and waitlisted ones, while
 * `autoAccept` is on). Rejected ones are always refused.
 */
export function decideShiftAssignment(
  status: VolunteerApplicationStatus,
  autoAccept: boolean = VOLUNTEER_ASSIGN_AUTO_ACCEPTS,
): VolunteerShiftAssignmentDecision {
  if (status === "accepted") return { kind: "assign", accept: false };
  if (status === "rejected") {
    return { kind: "refuse", message: VOLUNTEER_ASSIGN_REJECTED_MESSAGE };
  }
  if (autoAccept) return { kind: "assign", accept: true };
  return { kind: "refuse", message: VOLUNTEER_ADMIN_COPY.assignmentLocked };
}

/**
 * The role an assignment from the shift screen gives someone with none: their
 * 1st choice while it is active, else their 2nd, else none.
 */
export function defaultAssignedRoleId(
  choices: { firstChoiceRoleId: number; secondChoiceRoleId: number },
  activeRoleIds: ReadonlySet<number>,
): number | null {
  if (activeRoleIds.has(choices.firstChoiceRoleId)) {
    return choices.firstChoiceRoleId;
  }
  if (activeRoleIds.has(choices.secondChoiceRoleId)) {
    return choices.secondChoiceRoleId;
  }
  return null;
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

/** Whole years on `today` (La Paz) for a yyyy-MM-dd birth date. */
export function ageOn(birthdate: string, today: Date = new Date()): number {
  const born = DateTime.fromISO(birthdate, { zone: STORE_TIMEZONE });
  const now = DateTime.fromJSDate(today, { zone: STORE_TIMEZONE }).startOf(
    "day",
  );
  return Math.floor(now.diff(born, "years").years);
}

export type ShiftCoverageState =
  | { kind: "unset"; label: string }
  | { kind: "complete"; label: string }
  | { kind: "missing"; label: string; missing: number }
  | { kind: "short"; label: string; missing: number };

/**
 * A shift's coverage badge: green "Completo"; amber "Faltan N"; red "Faltan
 * N, solo M disponibles" when the people who marked it and are not yet
 * assigned can no longer fill it; "Sin cupo" while the cupo is 0.
 */
export function shiftCoverageState(shift: {
  neededHeadcount: number;
  assignedCount: number;
  unassignedAvailableCount: number;
}): ShiftCoverageState {
  if (shift.neededHeadcount <= 0) return { kind: "unset", label: "Sin cupo" };
  const missing = shift.neededHeadcount - shift.assignedCount;
  if (missing <= 0) return { kind: "complete", label: "Completo" };
  if (shift.unassignedAvailableCount < missing) {
    return {
      kind: "short",
      missing,
      label: `Faltan ${missing}, solo ${shift.unassignedAvailableCount} disponibles`,
    };
  }
  return { kind: "missing", missing, label: `Faltan ${missing}` };
}

/** "https://wa.me/59171234567" from "+591 7123-4567"; null without digits. */
export function whatsappHref(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}
