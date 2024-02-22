import { RedirectButton } from "@/app/components/redirect-button";

export default function ResourceNotFound() {
  return (
    <section className="h-full flex flex-col items-center justify-center">
      <h1 className="text-xl md:text-2xl">No se encontró el recurso</h1>
      <RedirectButton href="/" className="mt-4">
        Volver al inicio
      </RedirectButton>
    </section>
  );
}
