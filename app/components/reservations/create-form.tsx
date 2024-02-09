"use client";

import { SubmitButton } from "@/app/components/reservations/form/submit-button";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { toast } from "sonner";

async function logHello(
  currentState: { message: string; success: boolean } | undefined,
  formData: FormData,
) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  if (formData.get("test") === "hello") {
    return {
      message: "Your submission was correct",
      success: true,
    };
  } else {
    return {
      message: "There was a problem with your submission",
      success: false,
    };
  }
}

export function CreateReservationForm() {
  const [state, action] = useFormState(logHello, undefined);
  const [showToast, setShowToast] = useState();

  if (state?.success) {
    toast.success(state.message);
  } else {
    toast.error(state?.message);
  }

  return (
    <form action={action}>
      <Label>This is my form</Label>
      <Input name="test" type="text" placeholder="Name" />
      <SubmitButton />
      {/* {state?.message} */}
    </form>
  );
}
