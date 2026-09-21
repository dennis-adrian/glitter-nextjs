import { NewUser } from "@/app/api/users/definitions";

/**
 * The only `users` columns a profile owner may write through `updateProfile`.
 *
 * Everything else on the row is privileged: `status`, `role`, `verifiedAt` and
 * `category` decide what a profile is allowed to do on the site, `email` and
 * `clerkId` are the identity Clerk authenticates against, and
 * `participationType` / `shouldSubmitProducts` belong to the festival flows.
 * Those columns only move through the admin actions in
 * `app/api/users/actions.ts`.
 */
export const SELF_EDITABLE_PROFILE_FIELDS = [
  "firstName",
  "lastName",
  "displayName",
  "bio",
  "birthdate",
  "gender",
  "country",
  "state",
  "phoneNumber",
  "imageUrl",
] as const satisfies readonly (keyof NewUser)[];

export type SelfEditableProfileField =
  (typeof SELF_EDITABLE_PROFILE_FIELDS)[number];

export type SelfEditableProfile = Partial<
  Pick<NewUser, SelfEditableProfileField>
>;

/**
 * A server action receives whatever the caller serialized, and the type above
 * is erased by then, so the allow-list has to be applied at runtime too: copy
 * the permitted keys across and drop everything else.
 */
export function pickSelfEditableProfileFields(
  profile: SelfEditableProfile,
): SelfEditableProfile {
  const sanitized: SelfEditableProfile = {};
  if (!profile || typeof profile !== "object") return sanitized;

  for (const field of SELF_EDITABLE_PROFILE_FIELDS) {
    if (!Object.hasOwn(profile, field)) continue;
    Object.assign(sanitized, { [field]: profile[field] });
  }

  return sanitized;
}
