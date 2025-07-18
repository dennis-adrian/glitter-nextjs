import { RedirectButton } from "@/app/components/redirect-button";
import ResourceNotFound from "@/app/components/resource-not-found";
import { fetchVisitor, fetchVisitorByEmail } from "@/app/data/visitors/actions";
import VisitorRegistrationForm from "@/app/components/events/registration/visitor-registration-form";
import ThirdStep from "@/app/components/events/registration/steps/third-step";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import EmailCard from "@/app/components/events/registration/email-card";
import { Metadata } from "next";
import { fetchFestivalWithDates } from "@/app/lib/festivals/actions";

export const metadata: Metadata = {
  title: "Registro para evento",
  description: "Adquiere tu entrada para nuestro próximo festival",
};

export default async function Page(
  props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{
      email?: string;
      step?: string;
      visitorId?: string;
    }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
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
      <section className="container flex flex-col gap-4 md:gap-6 items-center justify-center min-h-[calc(100vh-64px-180px)] md:min-h-[calc(100vh-80px-140px)]">
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
								<h1 className="mb-2 text-xl font-semibold sm:text-2xl">Datos Personales</h1>
								<VisitorRegistrationForm email={email} visitor={visitor} />
							</>
						)}
						{step === "3" && visitor && (
							<ThirdStep festival={festival} visitor={visitor} profile={profile} />
						)}
					</div>
				</div>
			)}
		</div>
	);
}
