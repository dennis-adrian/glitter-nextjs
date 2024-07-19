import { FormBanner } from "@/app/components/events/registration/form-banner";
import EventDaySteps from "@/app/components/festivals/registration/event-day-steps";
import RegistrationTypeCards from "@/app/components/festivals/registration/registration-type-cards";
import RegistrationTypeStep from "@/app/components/festivals/registration/steps/registration-type-step";
import { fetchFestivalWithDates } from "@/app/data/festivals/actions";
import { fetchVisitor } from "@/app/data/visitors/actions";
import { notFound, redirect } from "next/navigation";
import { number, z } from "zod";

const ParamsSchema = z.object({
  id: z.coerce.number(),
});

const searchParamsSchema = z.object({
  email: z.string().email().optional(),
  enableTicketCreation: z.coerce.boolean().default(false).optional(),
  numberOfVisitors: z.coerce.number().optional(),
  type: z.enum(["individual", "family"]).optional(),
  visitorId: z.coerce.number().optional(),
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
  if (!validatedSearchParams.success) {
    redirect(`/festivals/${validatedParams.data.id}/event_day_registration`);
  }

  let visitor = null;
  if (validatedSearchParams.data.visitorId) {
    visitor = await fetchVisitor(validatedSearchParams.data.visitorId);
  }

  return (
    <div className="p-4 md:p-6 max-w-screen-md mx-auto">
      <h1 className="text-center mb-6 text-2xl font-bold md:text-3xl">
        {festival.name} - Registro
      </h1>
      <RegistrationTypeStep
        festivalId={validatedParams.data.id}
        type={validatedSearchParams.data.type}
      />
      {validatedSearchParams.data.type && festival ? (
        <EventDaySteps
          email={validatedSearchParams.data.email}
          enableTicketCreation={
            !!validatedSearchParams.data.enableTicketCreation
          }
          festival={festival}
          numberOfVisitors={validatedSearchParams.data.numberOfVisitors}
          registrationType={validatedSearchParams.data.type}
          visitor={visitor}
        />
      ) : null}
    </div>
  );
}
