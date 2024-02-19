"use client";

import { useFormState } from "react-dom";

import { createUserRequest } from "@/api/user_requests/actions";
import { ProfileType } from "@/app/api/users/definitions";
import { isProfileComplete } from "@/app/lib/utils";

import { SubmitButton } from "@/app/components/submit-button";

export default function BecomeArtistForm({
  profile,
}: {
  profile: ProfileType;
}) {
  const initialState = {
    message: "",
    success: false,
  };
  const createUserRequestWithRequest = createUserRequest.bind(null, {
    userId: profile.id,
  });
  const [state, action] = useFormState(
    createUserRequestWithRequest,
    initialState,
  );

  return isProfileComplete(profile) ? (
    <form action={action}>
      <SubmitButton variant="secondary" size="sm" formState={state}>
        ¡Soy artista!
      </SubmitButton>
    </form>
  ) : null;
}
