import { ProfileType } from "@/app/api/users/definitions";
import { Skeleton } from "@/app/components/ui/skeleton";
import CompleteProfileModal from "@/app/components/user_profile/complete-profile-modal";
import PrivateProfileOverview from "@/app/components/user_profile/private_profile/overview";
import PublicProfile from "@/app/components/user_profile/public_profile/profile";
import UserProfileBanner from "@/app/components/users/user-profile-banner";
import { fetchSubcategories } from "@/app/lib/subcategories/actions";
import { Suspense } from "react";

type UserProfileProps = {
	profile: ProfileType;
};

export default async function UserProfile({ profile }: UserProfileProps) {
	const subcategories = fetchSubcategories();

	return (
		<div className="container p-3 md:p-6 flex flex-col gap-2">
			<Suspense fallback={<Skeleton className="h-20 w-full" />}>
				<UserProfileBanner profile={profile} />
			</Suspense>
			<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
				<PublicProfile profile={profile} />
				<PrivateProfileOverview profile={profile} />
			</div>
			<CompleteProfileModal
				subcategoriesPromise={subcategories}
				profile={profile}
			/>
		</div>
	);
}
