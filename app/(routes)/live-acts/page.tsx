import type { Metadata } from "next";

import LiveActForm from "@/app/components/live-acts/live-act-form";

export const metadata: Metadata = {
	title: "Presentaciones en vivo",
	description:
		"¿Tenés música, baile o una charla para compartir? Completá el formulario y postulate para ser parte de nuestros festivales.",
};

export default function LiveActsPage() {
	return (
		<div className="container mx-auto max-w-2xl p-4 py-8 md:p-6 md:py-12">
			<LiveActForm />
		</div>
	);
}
