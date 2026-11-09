"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useUser } from "@clerk/nextjs";
import { MailIcon } from "lucide-react";

import GlitterLogo from "@/app/components/landing/glitter-logo";
import SocialIcon from "@/app/components/social-icon";
import {
  SITE_CONTACT_EMAIL,
  SOCIAL_LINKS,
  copyrightNotice,
} from "@/app/lib/site-contact";

/**
 * The marketing site's footer. Signed-in screens have the app's own shell
 * (sidebar, tab bar, Más), so it is for visitors only; its contact lives in
 * Más and the account menus for everyone else.
 */
export default function Footer({
  /** False until the `blog` flag is visible to this viewer. */
  blogEnabled = false,
  /** Whether the server saw a signed-in viewer; Clerk takes over once loaded. */
  signedIn: serverSignedIn = false,
}: {
  blogEnabled?: boolean;
  signedIn?: boolean;
}) {
  const pathname = usePathname();
  const { isLoaded, isSignedIn } = useUser();
  // The same answer the app shell is drawn from (`useAppViewer`), so the
  // footer leaves exactly when the sidebar and tab bar arrive.
  const signedIn = isLoaded ? Boolean(isSignedIn) : serverSignedIn;

  if (signedIn) return null;
  if (pathname === "/") return null;
  // Admin screens are sized to the viewport; the site footer only pushes
  // their tables and actions below the fold.
  if (pathname?.startsWith("/dashboard")) return null;
  // Festival registration is a focused flow without site navigation.
  if (pathname?.includes("festivals") && pathname.includes("registration")) {
    return null;
  }

  return (
    <footer className="px-4 md:px-6 py-12 bg-background border-t">
      <div className="container min-w-0">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div>
            <GlitterLogo height={60} width={60} variant="dark" />
          </div>
          <div>
            <h3 className="text-lg font-bold mb-4">Enlaces Útiles</h3>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/festivals/festicker"
                  className="text-muted-foreground hover:text-primary"
                >
                  Festicker
                </Link>
              </li>
              {blogEnabled ? (
                <li>
                  <Link
                    href="/blog"
                    className="text-muted-foreground hover:text-primary"
                  >
                    Blog
                  </Link>
                </li>
              ) : null}
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-bold mb-4">Conectate con nosotros</h3>
            <div className="flex space-x-4">
              {SOCIAL_LINKS.map((social) => (
                <Link
                  key={social.network}
                  target="_blank"
                  href={social.href}
                  className="text-muted-foreground hover:text-primary"
                >
                  <SocialIcon network={social.network} />
                  <span className="sr-only">{social.label}</span>
                </Link>
              ))}
            </div>
            <div className="mt-4">
              <p className="text-muted-foreground flex items-center">
                <MailIcon className="h-4 w-4 mr-2" />
                {SITE_CONTACT_EMAIL}
              </p>
            </div>
          </div>
        </div>
        <div className="mt-8 border-t pt-8 text-center">
          <p className="text-sm text-muted-foreground">{copyrightNotice()}</p>
        </div>
      </div>
    </footer>
  );
}
