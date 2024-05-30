import { fetchUserProfile } from "@/app/api/users/actions";
import NavbarContent from "@/app/components/navbar/content";
import { currentUser } from "@clerk/nextjs/server";

export default async function Navbar() {
  const user = await currentUser();
  const profile = await fetchUserProfile(user?.id || "");
  return <NavbarContent profile={profile} />;
}
