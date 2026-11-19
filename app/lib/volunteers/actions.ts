"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";

import {
  callerFingerprint,
  consumeActionRateLimit,
} from "@/app/lib/rate-limit";
import {
  type SubmitVolunteerApplicationResult,
  VOLUNTEER_COPY,
  VOLUNTEER_PRIVACY_NOTICE_VERSION,
} from "@/app/lib/volunteers/definitions";
import { sendVolunteerApplicationReceivedEmail } from "@/app/lib/volunteers/email";
import { fetchVolunteerCallForFestival } from "@/app/lib/volunteers/queries";
import {
  buildVolunteerApplicationSchema,
  isVolunteerCallOpen,
} from "@/app/lib/volunteers/schema";
import { db } from "@/db";
import {
  volunteerApplicationAvailableShifts,
  volunteerApplications,
} from "@/db/schema";

/**
 * Per network address. Generous on purpose: applicants share a university's
 * or a family's connection, and one person may take a few tries to get the
 * form right. It only stops floods; the unique email bounds the rest.
 */
const RATE_LIMIT = { limit: 60, windowMs: 60 * 60 * 1000 };

const festivalIdSchema = z.number().int().positive();

/** Same answer for a new application, a duplicate and a bot. */
const RECEIVED: SubmitVolunteerApplicationResult = { success: true };

function honeypotFilled(input: unknown): boolean {
  if (typeof input !== "object" || input === null) return false;
  const value = (input as { website?: unknown }).website;
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Stores a volunteer application for a festival's call. Server actions are
 * reachable by anyone, so everything is re-checked here against the
 * festival's own rows: the call must be open, and every shift and role must be
 * active and belong to this festival.
 *
 * One application per email and festival. A second one answers exactly like
 * the first and sends nothing, so the form never reveals that an address has
 * already applied.
 */
export async function submitVolunteerApplication(
  festivalId: number,
  input: unknown,
): Promise<SubmitVolunteerApplicationResult> {
  const festival = festivalIdSchema.safeParse(festivalId);
  if (!festival.success) {
    return { success: false, message: VOLUNTEER_COPY.genericError };
  }

  let allowed: boolean;
  try {
    allowed = await consumeActionRateLimit({
      key: `volunteer-application:ip:${callerFingerprint(await headers())}`,
      ...RATE_LIMIT,
    });
  } catch {
    allowed = false;
  }
  if (!allowed) {
    return { success: false, message: VOLUNTEER_COPY.tooManyRequests };
  }

  if (honeypotFilled(input)) return RECEIVED;

  const call = await fetchVolunteerCallForFestival(festival.data);
  if (!call || !call.ageCutoffDate) {
    return { success: false, message: VOLUNTEER_COPY.genericError };
  }
  const now = new Date();
  if (!isVolunteerCallOpen(call.applicationsCloseAt, now)) {
    return {
      success: false,
      closed: true,
      message: VOLUNTEER_COPY.closedMessage,
    };
  }

  const parsed = buildVolunteerApplicationSchema({
    roleIds: call.roles.map((role) => role.id),
    shiftIds: call.shifts.map((shift) => shift.id),
    ageCutoffDate: call.ageCutoffDate,
    applicationsCloseAt: call.applicationsCloseAt,
    now: () => now,
  }).safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message:
        parsed.error.issues[0]?.message ?? "Revisa los datos del formulario",
    };
  }
  const values = parsed.data;

  const applicationId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(volunteerApplications)
      .values({
        festivalId: festival.data,
        fullName: values.fullName,
        birthdate: values.birthdate,
        phone: values.phone,
        email: values.email,
        zone: values.zone,
        firstChoiceRoleId: values.firstChoiceRoleId,
        secondChoiceRoleId: values.secondChoiceRoleId,
        experience: values.experience,
        experienceNotes: values.experienceNotes,
        portfolio: values.portfolio,
        motivation: values.motivation,
        emergencyContactName: values.emergencyContactName,
        emergencyContactPhone: values.emergencyContactPhone,
        referralSource: values.referralSource,
        consentedAt: now,
        privacyNoticeVersion: VOLUNTEER_PRIVACY_NOTICE_VERSION,
        imageConsent: values.imageConsent,
      })
      .onConflictDoNothing({
        target: [volunteerApplications.festivalId, volunteerApplications.email],
      })
      .returning({ id: volunteerApplications.id });
    if (!inserted) return null;

    await tx.insert(volunteerApplicationAvailableShifts).values(
      values.shiftIds.map((shiftId) => ({
        applicationId: inserted.id,
        shiftId,
      })),
    );
    return inserted.id;
  });

  // A duplicate email: the same thank-you, and no second email.
  if (applicationId === null) return RECEIVED;

  const chosenShiftIds = new Set(values.shiftIds);
  const firstChoiceRole = call.roles.find(
    (role) => role.id === values.firstChoiceRoleId,
  )!;
  const secondChoiceRole = call.roles.find(
    (role) => role.id === values.secondChoiceRoleId,
  )!;
  after(() =>
    sendVolunteerApplicationReceivedEmail({
      applicationId,
      email: values.email,
      fullName: values.fullName,
      festivalName: call.festival.name,
      shifts: call.shifts.filter((shift) => chosenShiftIds.has(shift.id)),
      firstChoiceRole,
      secondChoiceRole,
    }),
  );

  return RECEIVED;
}
