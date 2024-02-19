"use client";

import { createUserRequest } from "@/api/user_requests/actions";
import { ProfileType } from "@/app/api/users/definitions";
import { SubmitButton } from "@/app/components/submit-button";
import { isProfileComplete } from "@/app/lib/utils";
import { Button } from "@/components/ui/button";
import { useFormState } from "react-dom";

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
    <form action={action} className="flex w-full justify-center">
      <SubmitButton formState={state}>¡Soy artista!</SubmitButton>
    </form>
  ) : (
    <div className="flex w-full justify-center">
      <Button disabled>¡Soy artista!</Button>
    </div>
  );
}
