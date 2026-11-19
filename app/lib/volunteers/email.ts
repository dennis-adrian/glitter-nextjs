import "server-only";

import VolunteerApplicationReceivedEmailTemplate from "@/app/emails/volunteer-application-received";
import type {
  VolunteerRole,
  VolunteerShift,
} from "@/app/lib/volunteers/definitions";
import { formatShiftSummary } from "@/app/lib/volunteers/format";
import { sendEmail } from "@/app/vendors/resend";
import { assertSent, sendFailureType } from "@/app/vendors/resend-result";

const VOLUNTEERS_FROM = "Equipo Glitter <equipo@productoraglitter.com>";

/** "Camila Andrea Rojas" → "Camila". */
function firstNameOf(fullName: string) {
  return fullName.trim().split(/\s+/)[0] ?? fullName.trim();
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
  festivalName: string;
  shifts: VolunteerShift[];
  firstChoiceRole: VolunteerRole;
  secondChoiceRole: VolunteerRole;
}) {
  try {
    const result = await sendEmail(
      {
        from: VOLUNTEERS_FROM,
        to: [input.email],
        subject: `Recibimos tu postulación como voluntario/a de ${input.festivalName}`,
        react: VolunteerApplicationReceivedEmailTemplate({
          firstName: firstNameOf(input.fullName),
          festivalName: input.festivalName,
          shifts: input.shifts.map(formatShiftSummary),
          firstChoiceRole: input.firstChoiceRole.name,
          secondChoiceRole: input.secondChoiceRole.name,
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
