"use client";

import {
  UserProfileWithRequests,
  createUserRequest,
} from "@/app/api/users/actions";
import { isProfileComplete } from "@/app/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function BecomeArtistForm({
  profile,
}: {
  profile: UserProfileWithRequests;
}) {
  function handleSubmit() {
    createUserRequest({ userId: profile.id }).then((res) => {
      if (res.success) {
        toast("Tu solicitud ha sido enviada", {
          description: "Te avisaremos si cumples con el perfil de artista",
        });
      }
    });
  }

  return (
    <form action={() => handleSubmit()} className="flex w-full justify-center">
      <Button disabled={!isProfileComplete(profile)}>¡Soy artista!</Button>
    </form>
  );
}
