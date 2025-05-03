import BadgesForm from "@/app/components/organisms/badges/badges-form";
import { fetchFestivals } from "@/app/data/festivals/actions";
import { getFestivalsOptions } from "@/app/data/festivals/helpers";

export default async function AddBadgePage() {
	const festivals = await fetchFestivals();

	const festivalsOptions = getFestivalsOptions(festivals);

	return (
		<div className="container p-4 md:p-6">
			<h1 className="text-2xl font-bold">Agregar medalla</h1>
			<div className="my-4 max-w-md mx-auto">
				<BadgesForm festivalsOptions={festivalsOptions} />
			</div>
		</div>
	);
}
