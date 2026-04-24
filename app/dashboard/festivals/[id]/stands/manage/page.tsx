import { notFound } from "next/navigation";
import { z } from "zod";

import StandManageTable from "@/app/components/maps/admin/stand-manage-table";
import { getFestivalById } from "@/app/lib/festivals/helpers";
import { fetchFestivalSectors } from "@/app/lib/festival_sectors/actions";

const ParamsSchema = z.object({
	id: z.coerce.number(),
});

export default async function StandManagePage({
	params,
}: {
	params: Promise<z.infer<typeof ParamsSchema>>;
}) {
	const parsed = ParamsSchema.safeParse(await params);
	if (!parsed.success) return notFound();

	const { id } = parsed.data;
	const [festival, sectors] = await Promise.all([
		getFestivalById(id),
		fetchFestivalSectors(id),
	]);

	if (!festival) return notFound();

	return (
		<div className="container p-4 md:p-6">
			<StandManageTable
				festivalId={id}
				festivalName={festival.name}
				sectors={sectors}
			/>
		</div>
	);
}
