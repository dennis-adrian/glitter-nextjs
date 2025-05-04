import TryAgainForm from "@/app/(routes)/my_profile/try-again-form";
import { RedirectButton } from "@/app/components/redirect-button";
import {
	createUserProfile,
	fetchUserProfileByClerkId,
	getCurrentClerkUser,
} from "@/app/lib/users/actions";
import { CircleCheckIcon, CircleXIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function ProfileCreationPage() {
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
						<CircleXIcon className="w-16 h-16 text-red-500" />
						<h1 className="text-2xl font-bold">
							Error al crear o validar tu perfil
						</h1>
						<p className="text-sm text-muted-foreground">
							Por favor, intenta nuevamente con los mismos datos o contactate
							con nuestro equipo de soporte{" "}
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
	}

	return redirect("/my_profile");
}
