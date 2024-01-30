"use client";

import { createUserRequest } from "@/app/api/users/actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function BecomeArtistForm({ userId }: { userId: number }) {
  function handleSubmit() {
    createUserRequest({ userId }).then((res) => {
      if (res.success) {
        console.log("success");
        toast("Tu solicitud ha sido enviada", {
          description: "Te avisaremos si cumples con el perfil de artista",
        });
      }
    });
  }
  return (
    <form action={() => handleSubmit()} className="flex w-full justify-center">
      <Button>¡Soy artista!</Button>
    </form>
  );
}
