"use client";

import { RedirectButton } from "@/app/components/redirect-button";

export default function FullProfileButton({
  profileId,
}: {
  profileId: number;
}) {
  return (
    <RedirectButton href={`/dashboard/users/${profileId}`}>
      Ver perfil completo
    </RedirectButton>
  );
}
