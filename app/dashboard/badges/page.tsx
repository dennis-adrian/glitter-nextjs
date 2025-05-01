import RedirectButton from "@/app/components/landing/redirect-button";

export default function BadgesPage() {
	return (
		<div className="container p-4 md:p-6">
			<h1 className="text-2xl font-bold">Medallas</h1>
			<div className="my-4 w-full">
				<RedirectButton href="/dashboard/badges/add">
					Agregar medalla
				</RedirectButton>
			</div>
		</div>
	);
}
