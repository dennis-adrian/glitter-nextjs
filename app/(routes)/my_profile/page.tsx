import TryAgainForm from "@/app/(routes)/my_profile/try-again-form";
import { Skeleton } from "@/app/components/ui/skeleton";
import CompleteProfileModal from "@/app/components/user_profile/complete-profile-modal";
import PrivateProfileOverview from "@/app/components/user_profile/private_profile/overview";
import PublicProfile from "@/app/components/user_profile/public_profile/profile";
import UserProfileBanner from "@/app/components/users/user-profile-banner";
import { fetchSubcategories } from "@/app/lib/subcategories/actions";
import {
	cachedFetchUserProfileByClerkId,
	getCurrentClerkUser,
} from "@/app/lib/users/actions";
import { InfoIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

export default async function Page() {
	const user = await getCurrentClerkUser();
	if (!user) return null;

	const profile = await cachedFetchUserProfileByClerkId(user.id);
	if (!profile) {
		return (
			<div className="container p-3 md:p-6 flex flex-col gap-2">
				<div className="flex flex-col gap-2 text-center items-center mt-40">
					<InfoIcon className="w-16 h-16 text-amber-500" />
					<h1 className="text-2xl font-bold">
						No encontramos los datos de tu perfil
					</h1>
					<p className="text-sm text-muted-foreground">
						Este puede ser un error temporal. Intenta nuevamente con los mismos
						datos o contáctate con nuestro equipo de soporte{" "}
						<Link
							className="underline text-blue-500"
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
