import RegistrationSteps from "@/app/components/festivals/registration/registration-steps";import { fetchFestivalWithDates } from "@/app/lib/festivals/actions";
;
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

  return (
    <div className="p-4 md:p-6 max-w-screen-md mx-auto">
      <h1 className="text-center mb-5 text-xl font-bold md:text-3xl">
        {festival.name} - Registro
      </h1>
      <RegistrationSteps festival={festival} />
    </div>
  );
}
