import UserProfile from "@/app/components/pages/user-profile";
import { UserProfileSkeleton } from "@/app/components/user_profile/skeleton";
import {
	fetchUserProfileByClerkId,
	getCurrentClerkUser,
} from "@/app/lib/users/actions";
import { redirect } from "next/navigation";
import { Suspense } from "react";

export default async function ProfileVerificationPage() {
	const user = await getCurrentClerkUser();
	if (!user) return null;

	const profile = await fetchUserProfileByClerkId(user.id);
	if (!profile) redirect("/my_profile/creation");

	return (
		<Suspense fallback={<UserProfileSkeleton />}>
			<UserProfile profile={profile} />
		</Suspense>
	);
}
