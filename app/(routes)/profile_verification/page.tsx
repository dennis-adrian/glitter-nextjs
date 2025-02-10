import CreateProfileModal from "@/app/(routes)/profile_verification/create-profile-modal";
import {
  fetchUserProfileByClerkId,
  getCurrentClerkUser,
} from "@/app/lib/users/actions";
import { redirect } from "next/navigation";

export default async function Page() {
  const user = await getCurrentClerkUser();
  if (!user) redirect("/sign_in");

  const profile = await fetchUserProfileByClerkId(user.id);

  if (profile) {
    redirect("/my_profile");
  }

  return <CreateProfileModal />;
}
