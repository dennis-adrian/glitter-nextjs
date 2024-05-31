import NavbarContent from "@/app/components/navbar/content";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function Navbar() {
  const profile = await getCurrentUserProfile();
  return <NavbarContent profile={profile} />;
}
