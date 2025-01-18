import EventDaySteps from "@/app/components/festivals/registration/event-day-steps";
import RegistrationTypeStep from "@/app/components/festivals/registration/steps/registration-type-step";
import { Progress } from "@/app/components/ui/progress";
import { fetchFestivalWithDates } from "@/app/data/festivals/actions";
import { fetchVisitor } from "@/app/data/visitors/actions";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

const ParamsSchema = z.object({
  id: z.coerce.number(),
});

const searchParamsSchema = z.object({
  birthdate: z.coerce.date().optional(),
  email: z.string().email().optional(),
  enableTicketCreation: z.coerce.boolean().default(false).optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phoneNumber: z.string().optional(),
  numberOfVisitors: z.coerce.number().optional(),
  step: z.coerce.number().optional(),
  type: z.enum(["individual", "family"]).optional(),
  visitorId: z.coerce.number().optional(),
});

export default async function Page(
  props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ type?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
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
      {validatedSearchParams.data.step &&
        !validatedSearchParams.data.enableTicketCreation && (
          <div className="flex flex-col items-center my-4 gap-2">
            <span className="w-fit min-w-fit text-center text-sm text-muted-foreground">
              Paso {validatedSearchParams.data.step} de 5
            </span>
            <Progress
              className="h-1 bg-gray-200"
              value={(validatedSearchParams.data.step * 100) / 5}
            />
          </div>
        )}
      {validatedSearchParams.data.type && festival ? (
        <EventDaySteps
          email={validatedSearchParams.data.email}
          enableTicketCreation={
            !!validatedSearchParams.data.enableTicketCreation
          }
          festival={festival}
          numberOfVisitors={validatedSearchParams.data.numberOfVisitors}
          registrationType={validatedSearchParams.data.type}
          step={validatedSearchParams.data.step}
          visitor={visitor}
        />
      ) : null}
    </div>
  );
}
