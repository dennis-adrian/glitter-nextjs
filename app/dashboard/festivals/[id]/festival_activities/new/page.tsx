import { notFound } from "next/navigation";
import { z } from "zod";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import FestivalActivityForm from "@/app/components/festivals/festival_activities/forms/festival-activity-form";

const ParamsSchema = z.object({
	id: z.coerce.number(),
});

type NewFestivalActivityPageProps = {
	params: Promise<z.infer<typeof ParamsSchema>>;
};

export default async function Page({ params }: NewFestivalActivityPageProps) {
	const validatedParams = ParamsSchema.safeParse(await params);
	if (!validatedParams.success) return notFound();

	const { id: festivalId } = validatedParams.data;

	return (
		<div className="container p-4 md:p-6 space-y-4">
			<div className="flex items-center gap-2">
				<Link
					href={`/dashboard/festivals/${festivalId}/festival_activities`}
					className="text-muted-foreground hover:text-foreground transition-colors"
				>
					<ArrowLeftIcon className="w-4 h-4" />
				</Link>
				<h1 className="text-2xl font-bold">Nueva actividad</h1>
			</div>
			<FestivalActivityForm festivalId={festivalId} />
		</div>
	);
}
