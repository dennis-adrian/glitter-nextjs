import { ProfileType } from "@/app/api/users/definitions";
import { Banner } from "@/app/components/ui/banner";
import { Button } from "@/app/components/ui/button";
import CompleteProfileModal from "@/app/components/user_profile/complete-profile-modal";
import PrivateProfileOverview from "@/app/components/user_profile/private_profile/overview";
import PublicProfile from "@/app/components/user_profile/public_profile/profile";
import { fetchSubcategories } from "@/app/lib/subcategories/actions";
import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

type UserProfileProps = {
	profile: ProfileType;
};

export default async function UserProfile({ profile }: UserProfileProps) {
	const subcategories = fetchSubcategories();

	return (
		<div className="container p-3 md:p-6 flex flex-col gap-2">
			<Banner
				variant="primary"
				title="¡Tenemos una nueva pagina de inicio para vos!"
			>
				<div className="flex flex-col gap-2">
					<span>
						Donde podrás acceder a tus reservas, pagos, notificaciones y más de
						forma más sencilla.
					</span>
					<Button asChild className="max-w-[500px] w-full self-center">
						<Link href="/portal">
							Ir a la nueva pagina de inicio
							<ArrowRightIcon className="size-4 ml-2" />
						</Link>
					</Button>
				</div>
			</Banner>
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
