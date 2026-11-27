import { VOLUNTEER_STEPS } from "@/app/lib/volunteers/definitions";
import type { VolunteerApplicationValues } from "@/app/lib/volunteers/schema";

/**
 * PostHog properties for the volunteer form. Ids, counts and fixed option
 * keys only: names, emails, phone numbers and free text never leave the form.
 */

export function volunteerFormStartedProperties(input: {
  festivalId: number;
  field: string;
}) {
  return { festival_id: input.festivalId, first_field: input.field };
}

export function volunteerFormStepViewedProperties(
  festivalId: number,
  stepIndex: number,
) {
  const step = VOLUNTEER_STEPS[stepIndex];
  return {
    festival_id: festivalId,
    step_number: stepIndex + 1,
    step_name: step?.section ?? "unknown",
  };
}

export function volunteerFormSubmittedProperties(
  festivalId: number,
  values: Pick<
    VolunteerApplicationValues,
    | "shiftIds"
    | "firstChoiceRoleId"
    | "secondChoiceRoleId"
    | "experience"
    | "referralSource"
    | "zone"
    | "portfolio"
    | "experienceNotes"
    | "imageConsent"
  >,
) {
  return {
    festival_id: festivalId,
    shift_ids: [...values.shiftIds].sort((a, b) => a - b),
    shift_count: values.shiftIds.length,
    first_choice_role_id: values.firstChoiceRoleId,
    second_choice_role_id: values.secondChoiceRoleId,
    experience: [...values.experience].sort(),
    referral_source: values.referralSource,
    has_zone: Boolean(values.zone),
    has_portfolio: Boolean(values.portfolio),
    has_experience_notes: Boolean(values.experienceNotes),
    image_consent: values.imageConsent,
  };
}
