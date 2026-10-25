import type { Metadata } from "next";
import { redirect } from "next/navigation";

import MoreMenu from "@/app/components/navbar/more-menu";
import { resolveNavFlags } from "@/app/components/navbar/nav-flags";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export const metadata: Metadata = {
  title: "Más",
};

/**
 * The installed app's fourth tab: everything that is not one of the three
 * destination tabs — the account, "Mi espacio", the rest of the site,
 * administration for staff, the theme and signing out.
 */
export default async function MoreMenuPage() {
  const [profile, flags] = await Promise.all([
    getCurrentUserProfile(),
    resolveNavFlags(),
  ]);

  if (!profile) {
    redirect("/sign_in");
  }

  return (
    <MoreMenu
      viewer={{ role: profile.role, status: profile.status }}
      account={{
        name:
          profile.displayName ||
          [profile.firstName, profile.lastName].filter(Boolean).join(" ") ||
          "Mi cuenta",
        imageUrl: profile.imageUrl ?? null,
      }}
      {...flags}
    />
  );
}
