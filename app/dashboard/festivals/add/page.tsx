
import NewFestivalForm from "@/app/components/festivals/forms/new-festival";
import Breadcrumbs from "@/app/components/ui/breadcrumbs";
export default function Page() {
	return (
		<div className="container p-4 md:p-6">
			<div className="mb-6">
				<Breadcrumbs
					breadcrumbs={[
						{ label: "Festivales", href: "/dashboard/festivals" },
						{ label: "Agregar Festivales", href: "/dashboard/festivals/add" },

					]}
				/>
			</div>
			<div className="max-w-2xl mx-auto">
				<h1 className="text-2xl font-bold">Nuevo Festival</h1>
				<NewFestivalForm />
			</div>
		</div>
	);
}
