import {
  VOLUNTEER_EXPERIENCE_VALUES,
  VOLUNTEER_REFERRAL_VALUES,
  VOLUNTEER_STEPS,
} from "@/app/lib/volunteers/definitions";

/**
 * The unsent application, kept in the tab's sessionStorage so a refresh or an
 * in-app browser reload (Instagram, WhatsApp) does not wipe four steps of
 * answers. It never leaves the browser, is cleared on success, and dies with
 * the tab. Every read is defensive: storage can throw (private mode, blocked
 * site data) or hold something an older version of the form wrote.
 */

const DRAFT_VERSION = 1;

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The form's raw values, as the steps hold them. */
export type VolunteerDraftValues = {
  fullName: string;
  birthdate: string;
  phone: string;
  email: string;
  zone: string;
  shiftIds: number[];
  firstChoiceRoleId: string;
  secondChoiceRoleId: string;
  experience: string[];
  experienceNotes: string;
  portfolio: string;
  motivation: string;
  referralSource: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  commitmentConsent: boolean;
  dataConsent: boolean;
  imageConsent: boolean;
};

export type VolunteerDraft = {
  /** Zero-based index into VOLUNTEER_STEPS. */
  step: number;
  values: Partial<VolunteerDraftValues>;
};

export function volunteerDraftKey(festivalId: number) {
  return `glitter:volunteer-draft:${festivalId}`;
}

const TEXT_FIELDS = [
  "fullName",
  "birthdate",
  "phone",
  "email",
  "zone",
  "experienceNotes",
  "portfolio",
  "motivation",
  "emergencyContactName",
  "emergencyContactPhone",
] as const;

const BOOLEAN_FIELDS = [
  "commitmentConsent",
  "dataConsent",
  "imageConsent",
] as const;

/**
 * Keeps only what the current form can show: known fields of the right type,
 * shifts and roles that are still offered. The honeypot is never kept.
 */
function sanitize(
  raw: unknown,
  offered: { roleIds: readonly number[]; shiftIds: readonly number[] },
): Partial<VolunteerDraftValues> {
  if (typeof raw !== "object" || raw === null) return {};
  const source = raw as Record<string, unknown>;
  const values: Partial<VolunteerDraftValues> = {};

  for (const field of TEXT_FIELDS) {
    const value = source[field];
    if (typeof value === "string" && value.length <= 2000) {
      values[field] = value;
    }
  }
  for (const field of BOOLEAN_FIELDS) {
    if (typeof source[field] === "boolean") values[field] = source[field];
  }

  const shiftIds = new Set(offered.shiftIds);
  if (Array.isArray(source.shiftIds)) {
    values.shiftIds = source.shiftIds.filter(
      (id): id is number => typeof id === "number" && shiftIds.has(id),
    );
  }

  const roleIds = new Set(offered.roleIds.map(String));
  for (const field of ["firstChoiceRoleId", "secondChoiceRoleId"] as const) {
    const value = source[field];
    if (typeof value === "string" && roleIds.has(value)) values[field] = value;
  }

  const experience = new Set<string>(VOLUNTEER_EXPERIENCE_VALUES);
  if (Array.isArray(source.experience)) {
    values.experience = source.experience.filter(
      (value): value is string =>
        typeof value === "string" && experience.has(value),
    );
  }

  const referral = source.referralSource;
  if (
    typeof referral === "string" &&
    (VOLUNTEER_REFERRAL_VALUES as readonly string[]).includes(referral)
  ) {
    values.referralSource = referral;
  }

  return values;
}

export function readVolunteerDraft(
  storage: DraftStorage | null | undefined,
  festivalId: number,
  offered: { roleIds: readonly number[]; shiftIds: readonly number[] },
): VolunteerDraft | null {
  try {
    const stored = storage?.getItem(volunteerDraftKey(festivalId));
    if (!stored) return null;
    const parsed = JSON.parse(stored) as {
      version?: unknown;
      step?: unknown;
      values?: unknown;
    };
    if (parsed.version !== DRAFT_VERSION) return null;
    const step =
      typeof parsed.step === "number" && Number.isInteger(parsed.step)
        ? Math.min(Math.max(parsed.step, 0), VOLUNTEER_STEPS.length - 1)
        : 0;
    return { step, values: sanitize(parsed.values, offered) };
  } catch {
    return null;
  }
}

export function writeVolunteerDraft(
  storage: DraftStorage | null | undefined,
  festivalId: number,
  draft: { step: number; values: Record<string, unknown> },
): void {
  try {
    // Destructured out so the honeypot never reaches storage.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { website, ...values } = draft.values;
    storage?.setItem(
      volunteerDraftKey(festivalId),
      JSON.stringify({ version: DRAFT_VERSION, step: draft.step, values }),
    );
  } catch {
    // Full or blocked storage: the form still works, it just won't survive a
    // reload.
  }
}

export function clearVolunteerDraft(
  storage: DraftStorage | null | undefined,
  festivalId: number,
): void {
  try {
    storage?.removeItem(volunteerDraftKey(festivalId));
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

/** `window.sessionStorage`, or null where reading it throws or there is none. */
export function browserSessionStorage(): DraftStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
