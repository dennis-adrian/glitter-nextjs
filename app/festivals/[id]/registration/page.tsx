import { fetchFestival } from "@/app/api/festivals/actions";

import { RedirectButton } from "@/app/components/redirect-button";
import ResourceNotFound from "@/app/components/resource-not-found";
import RegistrationFlow from "@/app/components/events/registration/flow";

export default async function Page({ params }: { params: { id: string } }) {
  const festival = await fetchFestival(parseInt(params.id));

  if (!festival) return <ResourceNotFound />;

  if (festival.status !== "active") {
    return (
      <section className="h-full flex flex-col items-center justify-center">
        <h1 className="text-xl md:text-2xl">
          El evento ya no se encuentra activo
        </h1>
        <RedirectButton href="/" className="mt-4">
          Volver al inicio
        </RedirectButton>
      </section>
    );
  }

  return (
    <div className="flex min-h-dvh justify-center items-center">
      <RegistrationFlow festival={festival} />
    </div>
  );
}
