import RegistrationSteps from "@/app/components/festivals/registration/registration-steps";
import { RedirectButton } from "@/app/components/redirect-button";
import { fetchFestivalWithDates } from "@/app/lib/festivals/actions";
import { notFound } from "next/navigation";
import { z } from "zod";

const ParamsSchema = z.object({
  id: z.coerce.number(),
});

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const validatedParams = ParamsSchema.safeParse(params);
  if (!validatedParams.success) notFound();

  const festival = await fetchFestivalWithDates(parseInt(params.id));
  if (!festival) notFound();

  // Same gate as the online form: closing acreditación from the dashboard
  // closes registration at the door too.
  if (festival.status !== "active" || !festival.publicRegistration) {
    return (
      <section className="container flex flex-col gap-4 md:gap-6 items-center justify-center px-3 md:px-6 min-h-[calc(100vh-64px-180px)] md:min-h-[calc(100vh-80px-140px)]">
        <h1 className="text-lg md:text-2xl text-muted-foreground text-center leading-5">
          El registro para este evento no se encuentra activo
        </h1>
        <RedirectButton href="/">Volver al inicio</RedirectButton>
      </section>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-screen-md mx-auto">
      <h1 className="text-center mb-5 text-xl font-bold md:text-3xl">
        {festival.name} - Registro
      </h1>
      <RegistrationSteps festival={festival} />
    </div>
  );
}
