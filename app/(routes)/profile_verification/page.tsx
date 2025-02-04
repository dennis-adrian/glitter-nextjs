import { RedirectDrawer } from "@/app/components/redirect-drawer";
import {
  createUserProfile,
  fetchUserProfileByClerkId,
} from "@/app/lib/users/actions";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function Page() {
  const user = await currentUser();
  if (!user) {
    redirect("/sign_in");
  }

  const profile = await fetchUserProfileByClerkId(user.id);

  if (profile) {
    redirect("/my_profile");
  }

  const { success } = await createUserProfile({
    clerkId: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.emailAddresses[0].emailAddress,
    imageUrl: user.imageUrl,
  });

  if (!success) {
    return (
      <RedirectDrawer
        title="¡Ups! Tuvimos un error"
        message="No pudimos encontrar o crear tu perfil. Te redirigiremos para que vuelvas a intentarlo."
      />
    );
  }

  redirect("/my_profile");
}
