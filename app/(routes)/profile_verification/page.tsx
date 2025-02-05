import FetchExistingProfile from "@/app/(routes)/profile_verification/fetch-existing-profile";
import Loading from "@/app/(routes)/profile_verification/loading";
import { RedirectDrawer } from "@/app/components/redirect-drawer";
import {
  createUserProfile,
  fetchUserProfileByClerkId,
} from "@/app/lib/users/actions";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

const searchParamsSchema = z.object({
  create: z.coerce.boolean().optional(),
});

type SearchParams = z.infer<typeof searchParamsSchema>;

export default async function Page(props: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await currentUser();
  if (!user) {
    redirect("/sign_in");
  }

  const searchParams = await props.searchParams;
  const validatedSearchParams = searchParamsSchema.safeParse(searchParams);
  if (!validatedSearchParams.success) {
    return <h1>error</h1>;
  }

  if (validatedSearchParams.data.create) {
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
          message="No pudimos crear tu perfil. Te redirigiremos para que vuelvas a intentarlo."
        />
      );
    }

    redirect("/my_profile?completeProfile=true");
  }

  const profile = fetchUserProfileByClerkId(user.id);
  return (
    <Suspense fallback={<Loading />}>
      <FetchExistingProfile profilePromise={profile} />
    </Suspense>
  );
}
