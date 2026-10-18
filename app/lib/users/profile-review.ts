import { ProfileType } from "@/app/api/users/definitions";
import {
  hasPlaceholderProfilePicture,
  isProfileComplete,
} from "@/app/lib/utils";

export const INCOMPLETE_PROFILE_REVIEW_REASON =
  "Completá tu perfil para pedir una nueva revisión.";

export const PLACEHOLDER_PICTURE_REVIEW_REASON =
  "Subí una foto de perfil para pedir una nueva revisión.";

/**
 * Why this profile cannot ask for a new review yet, or undefined when it can.
 * The button and `requestProfileReview` share it, so both refuse the same
 * profiles. Lives outside the "use server" module, which cannot export a
 * constant.
 *
 * `isProfileComplete` accepts the sign-up placeholder avatar, but the
 * completion modal does not, so the placeholder is refused here too: a
 * profile sent back to review must have a picture admins can judge.
 */
export function profileReviewBlocker(profile: ProfileType): string | undefined {
  if (!isProfileComplete(profile)) return INCOMPLETE_PROFILE_REVIEW_REASON;
  if (hasPlaceholderProfilePicture(profile)) {
    return PLACEHOLDER_PICTURE_REVIEW_REASON;
  }
  return undefined;
}
