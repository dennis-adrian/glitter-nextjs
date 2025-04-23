
import NewFestivalForm from "@/app/components/festivals/forms/new-festival";
import { RedirectButton } from "@/app/components/redirect-button";
import { ChevronLeft, Link } from "lucide-react";

export default function Page() {
	return (

		<div className="container p-4 md:p-6">
			<div className="mb-6">
				<RedirectButton href="/dashboard/festivals">
					<ChevronLeft className="mr-2 h-4 w-4" />
					Retornar a Festivales
				</RedirectButton>
			</div>

			<div className="max-w-2xl mx-auto">
				<h1 className="text-2xl font-bold mb-6">Nuevo Festival</h1>
				<div className="bg-background p-6 rounded-lg border">
					<NewFestivalForm /> { }
				</div>
			</div>
		</div>

	);
}
