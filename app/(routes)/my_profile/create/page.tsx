import { currentUser } from "@clerk/nextjs/server";

import { fetchOrCreateProfile } from "@/app/api/users/actions";
import { redirect } from "next/navigation";
import { RedirectDrawer } from "@/app/components/redirect-drawer";
import ProfileCreationForm from "@/app/components/user_profile/creation-form";
import { isProfileComplete } from "@/app/lib/utils";

export default async function UserProfileCreate() {
  const user = await currentUser();
  const profile = await fetchOrCreateProfile(user);

  if (!profile) {
    return (
      <RedirectDrawer
        title="¡Ups! Tuvimos un error"
        message="No pudimos encontrar o crear tu perfil. Te redirigiremos para que vuelvas a intentarlo."
      />
    );
  }

  if (isProfileComplete(profile)) redirect("/my_profile");

  return (
    <div className="container p-4 md:p-6">
      <ProfileCreationForm profile={profile} />
    </div>
  );
}
