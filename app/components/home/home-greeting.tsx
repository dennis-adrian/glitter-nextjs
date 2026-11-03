import Link from "next/link";

import { BookOpenIcon, SettingsIcon } from "lucide-react";

import type { BaseProfile } from "@/app/api/users/definitions";
import VerificationStatusLabel from "@/app/components/atoms/verification-status-label";

/** The status of the profile, the greeting, and the way to its settings. */
export default function HomeGreeting({
  profile,
  showBlogCta = false,
}: {
  profile: Pick<
    BaseProfile,
    "status" | "firstName" | "displayName"
  >;
  /** The only way into "Mis artículos" for a contributor who is not staff. */
  showBlogCta?: boolean;
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <VerificationStatusLabel status={profile.status} />
        <h1 className="font-display text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">
          Hola, {profile.firstName ?? profile.displayName ?? "artista"}
        </h1>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {showBlogCta ? (
          <Link
            href="/portal/blog"
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-brand-border bg-brand-card px-3.5 text-sm font-semibold text-brand-ink hover:border-brand-primary hover:text-brand-primary"
          >
            <BookOpenIcon className="size-4" aria-hidden="true" />
            Mis artículos
          </Link>
        ) : null}
        <Link
          href="/my_profile"
          aria-label="Configuración"
          className="inline-flex size-10 items-center justify-center rounded-full border border-brand-border bg-brand-card text-brand-ink hover:border-brand-primary hover:text-brand-primary"
        >
          <SettingsIcon className="size-5" aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}
