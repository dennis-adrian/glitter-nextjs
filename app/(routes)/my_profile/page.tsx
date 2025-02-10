import TryAgainForm from "@/app/(routes)/my_profile/try-again-form";
import { RedirectButton } from "@/app/components/redirect-button";
import { Skeleton } from "@/app/components/ui/skeleton";
import CompleteProfileModal from "@/app/components/user_profile/complete-profile-modal";
import PrivateProfileOverview from "@/app/components/user_profile/private_profile/overview";
import PublicProfile from "@/app/components/user_profile/public_profile/profile";
import UserProfileBanner from "@/app/components/users/user-profile-banner";
import { fetchSubcategories } from "@/app/lib/subcategories/actions";
import {
  createUserProfile,
  fetchUserProfileByClerkId,
  getCurrentClerkUser,
} from "@/app/lib/users/actions";
import { CircleCheckIcon, CircleXIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

const searchParamsSchema = z.object({
  completeProfile: z
    .string()
    .toLowerCase()
    .transform((val) => val === "true"),
});

type SearchParams = z.infer<typeof searchParamsSchema>;

export default async function Page(props: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentClerkUser();
  if (!user) return null;

  const profile = await fetchUserProfileByClerkId(user.id);
  if (!profile) {
    const res = await createUserProfile({
      clerkId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.emailAddresses[0].emailAddress,
      imageUrl: user.imageUrl,
    });

    if (res.success) {
      return (
        <div className="container p-3 md:p-6 flex flex-col gap-2">
          <div className="flex flex-col gap-2 text-center items-center mt-36">
            <h1 className="text-2xl font-bold">Perfil creado correctamente</h1>
            <CircleCheckIcon className="w-10 h-10 text-green-500" />
            <p className="text-sm text-muted-foreground">
              Por favor, completa tu perfil para continuar.
            </p>
            <RedirectButton
              className="mt-2"
              variant="outline"
              href="/my_profile"
            >
              Completar perfil
            </RedirectButton>
          </div>
        </div>
      );
    } else {
      return (
        <div className="container p-3 md:p-6 flex flex-col gap-2">
          <div className="flex flex-col gap-2 text-center items-center mt-40">
            <h1 className="text-2xl font-bold">Error al crear perfil</h1>
            <CircleXIcon className="w-10 h-10 text-red-500" />
            <p className="text-sm text-muted-foreground">
              Por favor, intenta nuevamente o contáctate con nuestro equipo de
              soporte{" "}
              <Link
                className="underline text-blue-500"
                href="mailto:soporte@productoraglitter.com"
              >
                soporte@productoraglitter.com
              </Link>
            </p>
            <TryAgainForm clerkId={user.id} />
          </div>
        </div>
      );
    }
  }

  const searchParams = await props.searchParams;
  const validatedSearchParams = searchParamsSchema.safeParse(searchParams);
  const subcategories = fetchSubcategories();

  return (
    <div className="container p-3 md:p-6 flex flex-col gap-2">
      <Suspense fallback={<Skeleton className="h-20 w-full" />}>
        <UserProfileBanner profile={profile} />
      </Suspense>
      <PublicProfile profile={profile} />
      <PrivateProfileOverview profile={profile} />
      <CompleteProfileModal
        subcategoriesPromise={subcategories}
        profile={profile}
        open={validatedSearchParams.data?.completeProfile}
      />
    </div>
  );
}
