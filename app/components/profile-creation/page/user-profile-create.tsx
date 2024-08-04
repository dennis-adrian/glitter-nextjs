import { fetchOrCreateProfile } from "@/app/api/users/actions";
import { RedirectDrawer } from "@/app/components/redirect-drawer";
import ProfileCreationForm from "@/app/components/user_profile/creation-form";
import { fetchSubcategories } from "@/app/lib/subcategories/actions";
import { isProfileComplete } from "@/app/lib/utils";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function UserProfileCreatePage() {
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
  const subcategories = await fetchSubcategories();

  return (
    <div className="container p-4 md:p-6">
      <ProfileCreationForm profile={profile} subcategories={subcategories} />
    </div>
  );
}
