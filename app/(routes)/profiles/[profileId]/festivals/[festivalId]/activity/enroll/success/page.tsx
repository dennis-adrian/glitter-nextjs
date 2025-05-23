"use client";

import { CheckCircleIcon } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { z } from "zod";

const SearchParamsSchema = z.object({
	profileId: z.coerce.number(),
	festivalId: z.coerce.number(),
});

export default function Page() {
	const router = useRouter();
	const params = useParams();

	const profileId = params.profileId;
	const festivalId = params.festivalId;

	const validatedParams = SearchParamsSchema.safeParse({
		profileId: profileId,
		festivalId: festivalId,
	});

	useEffect(() => {
		if (validatedParams.success) {
			const timeoutId = setTimeout(() => {
				router.push("/my_participations");
			}, 3000);

			return () => clearTimeout(timeoutId);
		}
	}, [router, validatedParams.success]);

	if (!validatedParams.success) {
		return (
			<div className="container p-3 md:p-6">
				<div className="flex flex-col items-center justify-center text-center">
					<p className="text-sm">
						Error al inscribirse en la actividad. Por favor, intenta nuevamente.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="container p-3 md:p-6">
			<div className="flex flex-col items-center justify-center text-center">
				<CheckCircleIcon
					className="w-10 h-10 text-emerald-500 mb-3"
					aria-hidden="true"
				/>
				<h1 className="text-xl md:text-2xl font-bold mb-1">
					Inscripción exitosa
				</h1>
				<p className="text-muted-foreground text-sm md:text-base">
					En breve serás redirigido a la página &quot;Mis Participaciones&quot;
				</p>
				<p className="text-muted-foreground text-sm md:text-base">o</p>
				<Link href="/my_participations">
					<span className="text-blue-500 hover:underline text-sm md:text-base">
						haz clic aquí
					</span>
				</Link>
			</div>
		</div>
	);
}
