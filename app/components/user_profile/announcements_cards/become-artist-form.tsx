"use client";

import { createUserRequest } from "@/app/api/users/actions";
import { Button } from "@/components/ui/button";

export default function BecomeArtistForm({ userId }: { userId: number }) {
  return (
    <form
      action={() => createUserRequest({ userId })}
      className="flex w-full justify-center"
    >
      <Button>¡Soy artista!</Button>
    </form>
  );
}
