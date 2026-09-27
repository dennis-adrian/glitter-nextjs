import DashboardViewerProvider from "@/app/components/dashboard/dashboard-viewer-provider";
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

  return (
    <DashboardViewerProvider viewer={{ id: profile.id, role: profile.role }}>
      {/* Exactly one viewport tall below the sticky navbar (and its
          announcement strip, which publishes its own height). A page that
          fills it with `flex min-h-0 flex-1 flex-col` fits the screen, its
          tables scrolling inside themselves. It is deliberately not a scroll
          container: a page still taller than this overflows into the window as
          before, so the sticky bars positioned against the window keep
          working. */}
      <div className="flex h-[calc(100dvh-77px-var(--announcement-strip-height,0px))] flex-col lg:h-[calc(100dvh-85px-var(--announcement-strip-height,0px))]">
        {children}
      </div>
    </DashboardViewerProvider>
  );
}
