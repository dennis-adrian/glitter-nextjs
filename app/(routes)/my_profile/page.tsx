import { Skeleton } from "@/app/components/ui/skeleton";
import CompleteProfileModal from "@/app/components/user_profile/complete-profile-modal";
import PrivateProfileOverview from "@/app/components/user_profile/private_profile/overview";
import PublicProfile from "@/app/components/user_profile/public_profile/profile";
import UserProfileBanner from "@/app/components/users/user-profile-banner";
import { fetchSubcategories } from "@/app/lib/subcategories/actions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
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
  const profile = await getCurrentUserProfile();
  if (!profile) return null;

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
