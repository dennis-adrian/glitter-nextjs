import type { Metadata } from "next";

import LiveActForm from "./live-act-form";

export const metadata: Metadata = {
  title: "Postulá tu acto en vivo",
  description:
    "¿Tenés música, danza o una charla para compartir? Completá el formulario y postulate para ser parte de nuestros festivales.",
};

export default function LiveActsPage() {
  return (
    <div className="container mx-auto max-w-2xl p-4 py-8 md:p-6 md:py-12">
      <div className="mb-8 flex flex-col gap-2">
        <h1 className="text-3xl font-bold md:text-4xl">Postulá tu acto en vivo</h1>
        <p className="text-muted-foreground">
          ¿Tenés música, danza o una charla para compartir con la comunidad?
          Completá el formulario y nos pondremos en contacto si tu acto es
          seleccionado para participar en uno de nuestros festivales.
        </p>
      </div>

      <LiveActForm />
    </div>
  );
}
