import BadgesForm from "@/app/components/organisms/badges/badges-form";

export default function AddBadgePage() {
	return (
		<div className="container p-4 md:p-6">
			<h1 className="text-2xl font-bold">Agregar medalla</h1>
			<div className="my-4 max-w-md mx-auto">
				<BadgesForm />
			</div>
		</div>
	);
}
