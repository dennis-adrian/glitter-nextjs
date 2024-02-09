"use client";

import { logHello } from "@/api/reservations/actions";
import { SubmitButton } from "@/app/components/reservations/form/submit-button";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { toast } from "sonner";

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
      <Label></Label>
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Elige una opción" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">Opción 1</SelectItem>
        </SelectContent>
      </Select>
    </form>
  );
}
