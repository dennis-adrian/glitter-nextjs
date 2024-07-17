import { FormBanner } from "@/app/components/events/registration/form-banner";
import RegistrationTypeCards from "@/app/components/festivals/registration/registration-type-cards";
import { fetchFestivalWithDates } from "@/app/data/festivals/actions";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

const ParamsSchema = z.object({
  id: z.coerce.number(),
});

const searchParamsSchema = z.object({
  type: z.enum(["individual", "family"]).optional(),
});

export default async function Page({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { type?: string };
}) {
  const validatedParams = ParamsSchema.safeParse(params);
  if (!validatedParams.success) notFound();

  const festival = await fetchFestivalWithDates(parseInt(params.id));
  if (!festival) notFound();

  const registrationType = searchParamsSchema.safeParse(searchParams);
  if (!registrationType.success)
    redirect(`/festivals/${validatedParams.data.id}/event_day_registration`);

  return (
    <div className="container p-4 md:p-6">
      <h1 className="my-4 text-2xl font-bold md:text-3xl">
        {festival.name} - Registro
      </h1>
      {!registrationType.data.type && (
        <h3 className="my-4 text-xl font-semibold text-center">
          Elige el tipo de registro
        </h3>
      )}
      <RegistrationTypeCards selectedType={registrationType.data.type} />
    </div>
  );
}
