import { fetchFestival } from "@/app/data/festivals/actions";

import { RedirectButton } from "@/app/components/redirect-button";
import ResourceNotFound from "@/app/components/resource-not-found";
import EmailSubmissionForm from "@/app/components/events/registration/email-submission-form";
import { fetchVisitor, fetchVisitorByEmail } from "@/app/data/visitors/actions";
import VisitorRegistrationForm from "@/app/components/events/registration/visitor-registration-form";
import VisitorTickets from "@/app/components/events/registration/visitor-tickets";
import { FormBanner } from "@/app/components/events/registration/form-banner";
import { currentUser } from "@clerk/nextjs/server";
import { fetchUserProfile } from "@/app/api/users/actions";

export default async function Page({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: {
    email?: string;
    step?: string;
    visitorId?: string;
  };
}) {
  const step = searchParams.step || "1";
  const email = searchParams.email || "";
  const visitorId = searchParams.visitorId || "";
  const festival = await fetchFestival(parseInt(params.id));
  let visitor = null;
  if (visitorId) {
    visitor = await fetchVisitor(parseInt(visitorId));
  } else if (email) {
    visitor = await fetchVisitorByEmail(email);
  }

  if (!festival) return <ResourceNotFound />;

  if (festival.status !== "active") {
    return (
      <section className="flex h-full flex-col items-center justify-center">
        <h1 className="text-xl md:text-2xl">
          El evento ya no se encuentra activo
        </h1>
        <RedirectButton href="/" className="mt-4">
          Volver al inicio
        </RedirectButton>
      </section>
    );
  }

  if (!["1", "2", "3"].includes(step)) {
    return (
      <section className="flex min-h-dvh flex-col items-center justify-center">
        <h1 className="text-xl md:text-2xl">
          El paso que intentas acceder no existe
        </h1>
        <RedirectButton
          href={`/festivals/${festival.id}/registration`}
          className="mt-4"
        >
          Volver al inicio
        </RedirectButton>
      </section>
    );
  }

  const user = await currentUser();
  let profile = null;
  if (user) {
    profile = await fetchUserProfile(user.id);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center">
      {step === "1" && <EmailSubmissionForm />}
      {step !== "1" && (
        <div className="container grid grid-cols-1 gap-y-4 px-3 sm:grid-cols-3 sm:px-8 md:gap-4">
          <FormBanner festival={festival} />
          <div className="col-span-2">
            {step === "2" && email && (
              <>
                <h1 className="mb-4 text-xl font-semibold sm:text-2xl">
                  Registro de Asistencia
                </h1>
                <VisitorRegistrationForm email={email} visitor={visitor} />
              </>
            )}
            {step === "3" && visitor && (
              <VisitorTickets
                festival={festival}
                visitor={visitor}
                currentUser={profile}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
