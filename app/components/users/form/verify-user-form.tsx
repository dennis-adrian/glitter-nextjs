"use client";

import { useFormState } from "react-dom";

import { SubmitButton } from "@/components/submit-button";
import { ProfileType } from "@/app/api/users/definitions";
import { toast } from "sonner";
import { deleteProfile, verifyProfile } from "@/app/api/users/actions";

export function VerifyProfileForm({
  profile,
  onSuccess,
}: {
  profile: ProfileType;
  onSuccess: () => void;
}) {
  const initialState = {
    message: "",
    success: false,
  };
  const verifyProfileWithIds = verifyProfile.bind(null, profile.id);
  const [state, action] = useFormState(verifyProfileWithIds, initialState);

  if (state.success) onSuccess();

  return (
    <form className="w-full mt-4" action={action}>
      <SubmitButton
        className="flex w-full"
        formState={state}
        variant="default"
        size="sm"
      >
        Verificar Usuario
      </SubmitButton>
    </form>
  );
}
