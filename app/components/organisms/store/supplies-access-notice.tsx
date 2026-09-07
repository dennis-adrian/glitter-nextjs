import { ClockIcon, LockIcon, LogInIcon, UserIcon } from "lucide-react";

import { RedirectButton } from "@/app/components/redirect-button";
import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert";

export type SuppliesAccessVariant = "signed_out" | "unverified";

type Props = {
  variant: SuppliesAccessVariant;
  /**
   * Path to come back to once the visitor signs in. Clerk only honors it when
   * the sign in URL carries it explicitly; without it the visitor lands on
   * NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL instead.
   */
  returnTo: string;
};

/**
 * Shown instead of the supplies content when the visitor is not a verified
 * user. Signed-out visitors get a sign in call to action; signed-in visitors
 * whose account is still pending, rejected, paused or banned get pointed at
 * their profile instead, since signing in again would not help them.
 */
export default function SuppliesAccessNotice({ variant, returnTo }: Props) {
  const signedOut = variant === "signed_out";
  const signInHref = `/sign_in?redirect_url=${encodeURIComponent(returnTo)}`;

  return (
    <div className="container px-3 py-10">
      <Alert>
        {signedOut ? (
          <LockIcon className="h-4 w-4" />
        ) : (
          <ClockIcon className="h-4 w-4" />
        )}
        <AlertTitle>
          <span className="leading-normal">
            {signedOut
              ? "Necesitás iniciar sesión para ver estos productos"
              : "Tu cuenta aún no está verificada"}
          </span>
        </AlertTitle>
        <AlertDescription>
          <p className="">
            {signedOut
              ? "El Mercadito de Insumos está disponible solo para perfiles verificados y activos. Si ya tenés tu perfil Glitter, iniciá sesión para ver todos los insumos disponibles."
              : "El Mercadito de Insumos está disponible solo para perfiles verificados y activos. Revisá tu perfil para conocer el estado de tu cuenta."}
          </p>
          <div className="mt-4">
            {signedOut ? (
              <RedirectButton href={signInHref} size="sm">
                <LogInIcon className="mr-2 h-4 w-4" />
                Iniciar sesión
              </RedirectButton>
            ) : (
              <RedirectButton href="/my_profile" size="sm" variant="outline">
                <UserIcon className="mr-2 h-4 w-4" />
                Ir a mi perfil
              </RedirectButton>
            )}
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}
