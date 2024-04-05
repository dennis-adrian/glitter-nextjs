"use client";

import { useFormState } from "react-dom";

import { SubmitButton } from "@/components/submit-button";
import { ProfileType } from "@/app/api/users/definitions";
import { toast } from "sonner";
import { deleteProfile } from "@/app/api/users/actions";

export function DeleteProfileForm({
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
  const deleteProfileWithIds = deleteProfile.bind(null, profile.id);
  const [state, action] = useFormState(deleteProfileWithIds, initialState);

  if (state.success) onSuccess();

  return (
    <form className="w-full mt-4" action={action}>
      <SubmitButton
        className="flex w-full"
        formState={state}
        variant="destructive"
        size="sm"
      >
        Eliminar Reserva
      </SubmitButton>
    </form>
  );
}
