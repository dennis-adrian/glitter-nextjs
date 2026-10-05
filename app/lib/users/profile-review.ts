import { ProfileType } from "@/app/api/users/definitions";
import { isProfileComplete } from "@/app/lib/utils";

export const INCOMPLETE_PROFILE_REVIEW_REASON =
  "Completá tu perfil para pedir una nueva revisión.";

/**
 * Why this profile cannot ask for a new review yet, or undefined when it can.
 * The button and `requestProfileReview` share it, so both refuse the same
 * profiles. Lives outside the "use server" module, which cannot export a
 * constant.
 */
export function profileReviewBlocker(profile: ProfileType): string | undefined {
  return isProfileComplete(profile)
    ? undefined
    : INCOMPLETE_PROFILE_REVIEW_REASON;
}
