import TryAgainForm from "@/app/(routes)/my_profile/try-again-form";
import UserProfile from "@/app/components/pages/user-profile";
import { UserProfileSkeleton } from "@/app/components/user_profile/skeleton";
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

	return (
		<Suspense fallback={<UserProfileSkeleton />}>
			<UserProfile profile={profile} />
		</Suspense>
	);
}
