"use client";

import { useFormState } from "react-dom";

import { createUserRequest } from "@/api/user_requests/actions";

import { SubmitButton } from "@/app/components/submit-button";

export default function ParticipationForm({
  festivalId,
  userId,
}: {
  festivalId: number;
  userId: number;
}) {
  const initialState = {
    message: "",
    success: false,
  };
  const createUserRequestWithRequest = createUserRequest.bind(null, {
    userId,
    festivalId,
    type: "festival_participation",
  });
  const [state, action] = useFormState(
    createUserRequestWithRequest,
    initialState,
  );

  return (
    <form action={action} className="flex w-full justify-center">
      <SubmitButton variant="secondary" formState={state}>
        ¡Quiero reservar!
      </SubmitButton>
    </form>
  );
}
