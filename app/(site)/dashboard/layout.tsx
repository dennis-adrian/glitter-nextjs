import DashboardViewerProvider from "@/app/components/dashboard/dashboard-viewer-provider";
import { isFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { redirect } from "next/navigation";
import { connection } from "next/server";

export const dynamic = "force-dynamic";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();

  const profile = await getCurrentUserProfile();

  if (!profile) {
    redirect("/sign_in");
  }

  if (
    profile &&
    !(profile.role === "festival_admin" || profile.role === "admin")
  ) {
    redirect("/");
  }

  const credentialsEnabled = await isFeatureEnabled(
    "festival_credentials",
    profile,
  );

  return (
    <DashboardViewerProvider
      viewer={{
        id: profile.id,
        role: profile.role,
        flags: { festival_credentials: credentialsEnabled },
      }}
    >
      {/* One viewport tall below the sticky navbar and above the installed
          app's tab bar, or taller with the page; a page that fills it with
          `flex min-h-0 flex-1 flex-col` fits the screen, its tables scrolling
          inside themselves. Sized in app/globals.css ([data-app-viewport]). */}
      <div data-app-viewport="">
        {children}
      </div>
    </DashboardViewerProvider>
  );
}
