"use client";

import { toast } from "sonner";

import { createUserRequest } from "@/app/api/users/actions";
import { Button } from "@/components/ui/button";

export default function ParticipationForm({
  festivalId,
  userId,
}: {
  festivalId: number;
  userId: number;
}) {
  function handleSubmit() {
    createUserRequest({
      userId,
      festivalId,
      type: "festival_participation",
    }).then((res) => {
      if (res.success) {
        toast("Tu solicitud ha sido enviada", {
          description: "Revisaremos tu perfil para confirmar tu participación",
        });
      }
    });
  }

  return (
    <form action={() => handleSubmit()} className="flex w-full justify-center">
      <Button className="m-auto">¡Quiero participar!</Button>
    </form>
  );
}
