import "server-only";

import VolunteerApplicationReceivedEmailTemplate from "@/app/emails/volunteer-application-received";
import {
  VOLUNTEER_COPY,
  type VolunteerCall,
  type VolunteerRole,
  type VolunteerShift,
} from "@/app/lib/volunteers/definitions";
import {
  formatCloseDate,
  formatFestivalDays,
  formatInduction,
  formatShiftWhen,
} from "@/app/lib/volunteers/format";
import { sendEmail } from "@/app/vendors/resend";
import { assertSent, sendFailureType } from "@/app/vendors/resend-result";

/** Replies reach the team's inbox, which the email invites for corrections. */
const VOLUNTEERS_FROM = "Productora Glitter <info@productoraglitter.com>";
const SUBJECT = "Recibimos tu postulación al voluntariado de Glitter";

/** "Camila Andrea Rojas" → "Camila". */
function firstNameOf(fullName: string) {
  return fullName.trim().split(/\s+/)[0] ?? fullName.trim();
}

/** "19 y 20 de diciembre de 2026, Teatro CBA, Santa Cruz de la Sierra". */
function festivalDetails(call: VolunteerCall): string | null {
  const parts = [
    formatFestivalDays(call.festival.days),
    call.festival.locationLabel,
    call.festival.address,
  ].filter((part): part is string => Boolean(part?.trim()));
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * The receipt for a new application: the same message as the thank-you
 * state, plus the shifts and roles the applicant chose. Called once, for a
 * newly stored application only. A failure is logged without the address and
 * never surfaces to the applicant, whose application is already saved.
 */
export async function sendVolunteerApplicationReceivedEmail(input: {
  applicationId: number;
  email: string;
  fullName: string;
  call: VolunteerCall;
  shifts: VolunteerShift[];
  firstChoiceRole: VolunteerRole;
  secondChoiceRole: VolunteerRole;
}) {
  try {
    const result = await sendEmail(
      {
        from: VOLUNTEERS_FROM,
        to: [input.email],
        subject: SUBJECT,
        react: VolunteerApplicationReceivedEmailTemplate({
          firstName: firstNameOf(input.fullName),
          festivalName: input.call.festival.name,
          shifts: input.shifts.map((shift) => ({
            when: formatShiftWhen(shift),
            label: shift.label,
          })),
          firstChoiceRole: input.firstChoiceRole.name,
          secondChoiceRole: input.secondChoiceRole.name,
          closesOn: formatCloseDate(input.call.applicationsCloseAt).date,
          festivalDetails: festivalDetails(input.call),
          induction: input.call.induction
            ? formatInduction(input.call.induction)
            : VOLUNTEER_COPY.inductionToBeConfirmed,
        }) as React.ReactElement,
      },
      {
        idempotencyKey: `volunteer-application-received:${input.applicationId}`,
      },
    );
    assertSent(result);
  } catch (error) {
    console.error("Volunteer application email failed", {
      applicationId: input.applicationId,
      errorType: sendFailureType(error),
    });
  }
}
