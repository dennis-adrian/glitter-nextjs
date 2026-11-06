import TryAgainForm from "@/app/(routes)/my_profile/try-again-form";
import { createUserProfile } from "@/app/lib/users/actions";
import { getViewerClerkId } from "@/app/lib/impersonation/viewer";
import { fetchUserProfileByClerkId } from "@/app/lib/users/queries";
import { CircleXIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function ProfileCreationPage() {
  const clerkId = await getViewerClerkId();
  if (!clerkId) return null;

  const profile = await fetchUserProfileByClerkId(clerkId);
  if (!profile) {
    const res = await createUserProfile();

    if (res.success) {
      return redirect("/my_profile");
    } else {
      return (
        <div className="container p-3 md:p-6 flex flex-col gap-2">
          <div className="flex flex-col gap-2 text-center items-center mt-40">
            <CircleXIcon className="w-16 h-16 text-red-500" />
            <h1 className="text-2xl font-bold">
              Error al crear o validar tu perfil
            </h1>
            <p className="text-sm text-muted-foreground">
              Por favor, intenta nuevamente con los mismos datos o contactate
              con nuestro equipo de soporte{" "}
              <Link
                className="underline text-blue-500 dark:text-blue-400"
                href="mailto:soporte@productoraglitter.com"
              >
                soporte@productoraglitter.com
              </Link>
            </p>
            <TryAgainForm />
          </div>
        </div>
      );
    }
  }

  return redirect("/my_profile");
}
