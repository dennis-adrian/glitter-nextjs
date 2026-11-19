import UserProfile from "@/app/components/pages/user-profile";
import { UserProfileSkeleton } from "@/app/components/user_profile/skeleton";
import { getViewerClerkId } from "@/app/lib/impersonation/viewer";
import { fetchUserProfileByClerkId } from "@/app/lib/users/queries";
import { redirect } from "next/navigation";
import { Suspense } from "react";

export default async function ProfileVerificationPage() {
  const clerkId = await getViewerClerkId();
  if (!clerkId) return null;

  const profile = await fetchUserProfileByClerkId(clerkId);
  if (!profile) redirect("/my_profile/creation");

  return (
    <Suspense fallback={<UserProfileSkeleton />}>
      <UserProfile profile={profile} />
    </Suspense>
  );
}
