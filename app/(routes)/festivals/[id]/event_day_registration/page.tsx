import { FormBanner } from "@/app/components/events/registration/form-banner";
import EventDaySteps from "@/app/components/festivals/registration/event-day-steps";
import RegistrationTypeCards from "@/app/components/festivals/registration/registration-type-cards";
import RegistrationTypeStep from "@/app/components/festivals/registration/steps/registration-type-step";
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

  const validatedSearchParams = searchParamsSchema.safeParse(searchParams);
  if (!validatedSearchParams.success)
    redirect(`/festivals/${validatedParams.data.id}/event_day_registration`);

  return (
    <div className="p-4 md:p-6 max-w-screen-md mx-auto">
      <h1 className="text-center mb-6 text-2xl font-bold md:text-3xl">
        {festival.name} - Registro
      </h1>
      <RegistrationTypeStep
        festivalId={validatedParams.data.id}
        type={validatedSearchParams.data.type}
      />
      {validatedSearchParams.data.type && festival && (
        <EventDaySteps festival={festival} />
      )}
    </div>
  );
}
