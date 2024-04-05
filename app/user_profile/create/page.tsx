import { currentUser } from "@clerk/nextjs";

import { createUserProfile, fetchUserProfile } from "@/app/api/users/actions";
import { redirect } from "next/navigation";
import { RedirectDrawer } from "@/app/components/redirect-drawer";

export default async function UserProfileCreate() {
  const user = await currentUser();
  const profile = await fetchUserProfile(user!.id);

  if (profile) {
    redirect("/user_profile");
  } else {
    const res = await createUserProfile(user!);
    if (!res) {
      return (
        <RedirectDrawer
          title="¡Ups! Tuvimos un error"
          message="No pudimos encontrar o crear tu perfil. Te redirigiremos para que vuelvas a intentarlo."
        />
      );
    }
  }

  return null;
}
