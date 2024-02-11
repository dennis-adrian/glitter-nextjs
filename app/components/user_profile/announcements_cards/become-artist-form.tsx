"use client";

import { createUserRequest } from "@/api/user_requests/actions";
import { ProfileType } from "@/app/api/users/definitions";
import { SubmitButton } from "@/app/components/submit-button";
import { isProfileComplete } from "@/app/lib/utils";
import { Button } from "@/components/ui/button";
import { revalidatePath } from "next/cache";
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
  const createUserRequestWithId = createUserRequest.bind(null, profile.id);
  const [state, action] = useFormState(createUserRequestWithId, initialState);

  return (
    <form action={action} className="flex w-full justify-center">
      {isProfileComplete(profile) ? (
        <SubmitButton formState={state} size="sm">
          ¡Soy artista!
        </SubmitButton>
      ) : (
        <Button disabled>¡Soy artista!</Button>
      )}
    </form>
  );
}
