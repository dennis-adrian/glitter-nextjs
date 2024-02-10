import { currentUser } from "@clerk/nextjs";

import { londrinaSolid } from "@/ui/fonts";
import { createUserProfile, isProfileCreated } from "@/app/api/users/actions";
import { redirect } from "next/navigation";
import { RedirectDrawer } from "@/app/components/redirect-drawer";

export default async function UserProfileCreate() {
  let user = null;

  try {
    user = await currentUser();
  } catch {
    return (
      <RedirectDrawer
        title="¡Ups! Tuvimos un error"
        message="No pudimos encontrar o crear tu perfil. Te redirigiremos para que vuelvas a intentarlo."
      />
    );
  }

  if (user) {
    if (await isProfileCreated(user)) {
      redirect("/user_profile");
    } else {
      await createUserProfile(user);
    }
  }

  return (
    <div className="flex justify-center items-center h-full">
      <h1 className={`${londrinaSolid.className} text-4xl`}>
        ¡Bienvenido a Glitter!
      </h1>
    </div>
  );
}
