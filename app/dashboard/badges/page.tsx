import BadgesTable from "@/app/components/organisms/badges/table/badges-table";
import { RedirectButton } from "@/app/components/redirect-button";
import { Suspense } from "react";

export default function BadgesPage() {
	return (
		<div className="container p-4 md:p-6">
			<h1 className="text-2xl font-bold">Medallas</h1>
			<div className="my-4 w-full">
				<RedirectButton href="/dashboard/badges/add">
					Agregar medalla
				</RedirectButton>
				<Suspense fallback={<div>Cargando...</div>}>
					<BadgesTable />
				</Suspense>
			</div>
		</div>
	);
}
