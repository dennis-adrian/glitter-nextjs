import { Skeleton } from "@/app/components/ui/skeleton";
import PrivateProfileOverview from "@/app/components/user_profile/private_profile/overview";
import PublicProfile from "@/app/components/user_profile/public_profile/profile";
import UserProfileBanner from "@/app/components/users/user-profile-banner";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { Suspense } from "react";

export default async function UserProfile() {
  const profile = await getCurrentUserProfile();
  if (!profile) return null;

  return (
    <div className="container p-3 md:p-6 flex flex-col gap-2">
      <Suspense fallback={<Skeleton className="h-20 w-full" />}>
        <UserProfileBanner profile={profile} />
      </Suspense>
      <PublicProfile profile={profile} />
      <PrivateProfileOverview profile={profile} />
    </div>
  );
}
