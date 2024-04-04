import { fetchUserProfile } from "@/app/api/users/actions";
import { currentUser } from "@clerk/nextjs";
import { redirect } from "next/navigation";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  const profile = await fetchUserProfile(user.id);

  if (
    profile &&
    !(profile.role === "festival_admin" || profile.role === "admin")
  ) {
    redirect("/");
  }

  return <>{children}</>;
}
