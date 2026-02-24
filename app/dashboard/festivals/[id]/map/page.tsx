import { notFound } from "next/navigation";
import { z } from "zod";

import { fetchFestivalSectors } from "@/app/lib/festival_sectors/actions";
import { fetchInvoicesByFestival } from "@/app/data/invoices/actions";
import { getFestivalById } from "@/app/lib/festivals/helpers";
import AdminOverviewMap from "@/app/components/maps/admin/admin-overview-map";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const ParamsSchema = z.object({
	id: z.coerce.number(),
});

export default async function FestivalMapPage(props: {
	params: Promise<z.infer<typeof ParamsSchema>>;
}) {
	const params = await props.params;
	const parsed = ParamsSchema.safeParse(params);

	if (!parsed.success) {
		return notFound();
	}

	const { id } = parsed.data;

	const [festival, sectors, invoices] = await Promise.all([
		getFestivalById(id),
		fetchFestivalSectors(id),
		fetchInvoicesByFestival(id),
	]);

	if (!festival) {
		return notFound();
	}

	return (
		<div className="container p-4 md:p-6">
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink href="/dashboard/festivals">
							Festivales
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>Mapa — {festival.name}</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
			<h1 className="my-2 text-2xl font-bold md:text-3xl">
				Mapa del festival — {festival.name}
			</h1>
			<p className="text-muted-foreground mb-6">
				Visualiza el estado de los espacios y gestiona las reservas directamente
				desde el mapa.
			</p>
			<AdminOverviewMap sectors={sectors} invoices={invoices} />
		</div>
	);
}
