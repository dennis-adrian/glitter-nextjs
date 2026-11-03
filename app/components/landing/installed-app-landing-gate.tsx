"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Loader2Icon } from "lucide-react";

import { INSTALLED_APP_SIGN_IN_HREF } from "@/app/components/landing/installed-app";

/** Whether this page is running as the installed app rather than in a tab. */
export function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS reports a home-screen web app here too, older versions only here.
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
}

/**
 * Keeps the marketing landing out of the installed app.
 *
 * The app opens on `/launch`, which never shows the landing, but `/` is still
 * reachable from inside it: the header's logo, signing out, and iPhones that
 * installed Glitter before the start page changed and keep opening `/`. There
 * the landing is hidden by CSS from the first paint, a short loading state
 * shows instead, and the page replaces itself with sign-in once it runs.
 *
 * Only render it for a visitor without a session: someone signed in never
 * reaches the landing (the page sends them to their portal), and a session
 * whose profile is still being created must not be bounced to sign in, which
 * would send them straight back here.
 */
export default function InstalledAppLandingGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    if (isInstalledApp()) router.replace(INSTALLED_APP_SIGN_IN_HREF);
  }, [router]);

  return (
    <>
      <div className="standalone:hidden">{children}</div>
      <div
        role="status"
        className="hidden min-h-[60vh] flex-col items-center justify-center gap-3 text-brand-neutral standalone:flex"
      >
        <Loader2Icon className="size-6 animate-spin" aria-hidden="true" />
        <span className="text-sm">Abriendo Glitter…</span>
      </div>
    </>
  );
}
