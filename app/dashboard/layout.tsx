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

  return <>{children}</>;
}
