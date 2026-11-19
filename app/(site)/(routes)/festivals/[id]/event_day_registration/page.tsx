import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import RegistrationSteps from "@/app/components/festivals/registration/registration-steps";
import { RedirectButton } from "@/app/components/redirect-button";
import {
  loadRegistrationFestival,
  REGISTRATION_CLOSED_MESSAGE,
  registrationBlocker,
} from "@/app/lib/visitors/registration-data";

export const metadata: Metadata = {
  title: "Registro en puerta",
  robots: { index: false, follow: false },
};

const ParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * Registro en puerta: opened from the QR at the venue, and only on a
 * festival day with the switch on. Any other time it sends visitors to the
 * online form, where they can still pick a date.
 */
export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = ParamsSchema.safeParse(await props.params);
  if (!params.success) notFound();

  const festival = await loadRegistrationFestival(params.data.id);
  if (!festival) notFound();

  const blocker = registrationBlocker(festival, "door");
  if (blocker === REGISTRATION_CLOSED_MESSAGE) {
    return (
      <section className="container flex flex-col gap-4 md:gap-6 items-center justify-center px-3 md:px-6 min-h-[calc(100vh-64px-180px)] md:min-h-[calc(100vh-80px-140px)]">
        <h1 className="text-lg md:text-2xl text-muted-foreground text-center leading-5">
          {blocker}
        </h1>
        <RedirectButton href="/">Volver al inicio</RedirectButton>
      </section>
    );
  }
  // Acreditación is open but the door form is not (switch off, or not a
  // festival day): the online form still gets them a ticket.
  if (blocker) redirect(`/festivals/${festival.id}/registration`);

  return (
    <div className="p-4 md:p-6 max-w-screen-md mx-auto">
      <h1 className="text-center mb-5 text-xl font-bold md:text-3xl">
        {festival.name} - Registro
      </h1>
      <RegistrationSteps
        festivalId={festival.id}
        festival={{
          name: festival.name,
          mascotUrl: festival.mascotUrl,
          locationLabel: festival.locationLabel,
          address: festival.address,
        }}
      />
    </div>
  );
}
