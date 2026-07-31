"use client";

import { useAuth } from "@clerk/nextjs";

export default function ParticipantDiscountHint() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded || isSignedIn) return null;

  return (
    <p className="mt-3 text-sm font-bold text-[#dff8f4]">
      Si tenés un perfil Glitter verificado, podés acceder al precio con
      descuento. Solo tenés que iniciar sesión.
    </p>
  );
}
