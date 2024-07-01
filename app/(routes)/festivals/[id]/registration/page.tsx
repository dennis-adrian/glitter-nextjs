import { fetchFestivalWithDates } from "@/app/data/festivals/actions";

import { RedirectButton } from "@/app/components/redirect-button";
import ResourceNotFound from "@/app/components/resource-not-found";
import EmailSubmissionForm from "@/app/components/events/registration/email-submission-form";
import { fetchVisitor, fetchVisitorByEmail } from "@/app/data/visitors/actions";
import VisitorRegistrationForm from "@/app/components/events/registration/visitor-registration-form";
import { FormBanner } from "@/app/components/events/registration/form-banner";
import ThirdStep from "@/app/components/events/registration/steps/third-step";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

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
  const festival = await fetchFestivalWithDates(parseInt(params.id));
  let visitor = null;
  if (visitorId) {
    visitor = await fetchVisitor(parseInt(visitorId));
  } else if (email) {
    visitor = await fetchVisitorByEmail(email);
  }

  if (!festival) return <ResourceNotFound />;

  if (festival.status !== "active" || !festival.publicRegistration) {
    return (
      <section className="flex h-dvh flex-col items-center justify-center">
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

  const profile = await getCurrentUserProfile();

  return (
    <div className="flex min-h-dvh items-center justify-center">
      {step === "1" && <EmailSubmissionForm />}
      {step !== "1" && (
        <div className="container px-3 grid grid-cols-1 gap-y-4 lg:grid-cols-3 md:gap-4">
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
              <ThirdStep
                festival={festival}
                visitor={visitor}
                profile={profile}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
