import { RedirectButton } from "@/app/components/redirect-button";
import ResourceNotFound from "@/app/components/resource-not-found";
import { fetchPublicVisitorByEmail } from "@/app/data/visitors/queries";
import VisitorRegistrationForm from "@/app/components/events/registration/visitor-registration-form";
import ThirdStep from "@/app/components/events/registration/steps/third-step";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import EmailCard from "@/app/components/events/registration/email-card";
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { fetchFestivalWithDates } from "@/app/lib/festivals/actions";

export const metadata: Metadata = {
  title: "Registro para evento",
  description: "Adquiere tu entrada para nuestro próximo festival",
};

export default async function Page(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    email?: string;
    step?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const step = searchParams.step || "1";
  const email = searchParams.email || "";
  const festival = await fetchFestivalWithDates(parseInt(params.id));
  // Found by the email the visitor typed, never by an id in the URL: ids are
  // sequential, and anyone can open this page. Only the name and the tickets
  // come back.
  const visitor = email ? await fetchPublicVisitorByEmail(email) : null;

  if (!festival) return <ResourceNotFound />;

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

  if (!["1", "2", "3"].includes(step)) {
    return (
      <section className="flex flex-col items-center justify-center">
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

  // An address that is already registered has nothing left to fill in; its
  // tickets are the next step.
  if (step === "2" && visitor) {
    redirect(
      `/festivals/${festival.id}/registration?${new URLSearchParams({ email, step: "3" })}`,
    );
  }

  const profile = await getCurrentUserProfile();

  return (
    <div>
      {step === "1" && (
        <div className="container p-4 md:p-6">
          <EmailCard festival={festival} />
        </div>
      )}
      {step !== "1" && (
        <div className="container p-4 md:p-6">
          <div className="mb-4">
            {step === "2" && email && (
              <>
                <h1 className="mb-2 text-xl font-semibold sm:text-2xl">
                  Datos Personales
                </h1>
                <VisitorRegistrationForm email={email} />
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
