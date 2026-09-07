import { LockIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/app/components/ui/button";

type Reason = "anonymous" | "unverified";

/**
 * Replaces the body of a restricted article for a reader who cannot open it.
 *
 * The two cases need different sentences: someone signed out has a one-click
 * fix, while someone signed in with an unverified profile is waiting on us and
 * should be told that rather than bounced to a login form they have already
 * used.
 */
export default function PostGate({
  reason,
  slug,
}: {
  reason: Reason;
  slug: string;
}) {
  // This app's auth routes use underscores, and every other caller passes
  // `returnUrl` so the reader lands back where they were.
  const returnUrl = encodeURIComponent(`/blog/${slug}`);

  return (
    <section className="my-8 rounded-lg border bg-muted/40 px-6 py-10 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-background">
        <LockIcon className="size-5 text-muted-foreground" />
      </div>

      <h2 className="mt-4 text-xl font-semibold">
        Este artículo es solo para participantes
      </h2>

      {reason === "anonymous" ? (
        <>
          <p className="mx-auto mt-2 max-w-prose text-muted-foreground">
            Iniciá sesión con tu cuenta de participante para leerlo completo.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link href={`/sign_in?returnUrl=${returnUrl}`}>
                Iniciar sesión
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/sign_up?returnUrl=${returnUrl}`}>
                Crear una cuenta
              </Link>
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mx-auto mt-2 max-w-prose text-muted-foreground">
            Tu perfil todavía no está verificado. Completá tu perfil y, una vez
            que lo aprobemos, vas a poder leer este y todos los artículos para
            participantes.
          </p>
          <div className="mt-6 flex justify-center">
            <Button asChild>
              <Link href="/my_profile">Ir a mi perfil</Link>
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
