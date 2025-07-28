import SubmittedProductsCard from "@/app/components/molecules/submitted-products-card";
import { ParticipantProductsUpload } from "@/app/components/organisms/participant-products-upload";
import { fetchActiveFestivalBase } from "@/app/lib/festivals/actions";
import { fetchParticipationInFestival } from "@/app/lib/participations/actions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { notFound } from "next/navigation";

export default async function SubmitProductsPage() {
	const currentProfile = await getCurrentUserProfile();
	const currentFestival = await fetchActiveFestivalBase();

	if (!currentProfile || !currentFestival) {
		return notFound();
	}

	const participation = await fetchParticipationInFestival(
		currentProfile.id,
		currentFestival.id,
	);

	if (!participation) {
		return (
			<div className="container p-3 md:p-6">
				<h1 className="text-lg md:text-2xl font-bold mb-2 md:mb-3">
					No estás participando en ningún festival en este momento.
				</h1>
			</div>
		);
	}

	return (
		<div className="container p-3 md:p-6">
			<h1 className="text-lg md:text-2xl font-bold mb-2 md:mb-3">
				Subí imágenes de tus productos
			</h1>
			<div className="flex flex-col gap-1 text-sm md:text-base mb-4 md:mb-5">
				<p>
					Necesitamos que subas imágenes de todos los productos que ofrecerás en
					el festival. Para que podamos revisarlos y asegurarnos de que todo
					esté dentro de lo permitido.
				</p>
				<p>
					En caso de no subir las imágenes hasta la fecha límite, tu
					participación será cancelada.
				</p>
			</div>
			<ParticipantProductsUpload
				profile={currentProfile}
				festival={currentFestival}
				participation={participation}
			/>
			<SubmittedProductsCard
				profileId={currentProfile.id}
				festivalId={currentFestival.id}
			/>
		</div>
	);
}
