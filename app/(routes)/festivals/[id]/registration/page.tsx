import { RedirectButton } from "@/app/components/redirect-button";
import ResourceNotFound from "@/app/components/resource-not-found";
import VisitorRegistrationForm from "@/app/components/events/registration/visitor-registration-form";
import VisitorTickets from "@/app/components/events/registration/visitor-tickets";
import EmailCard from "@/app/components/events/registration/email-card";
import { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  bookableFestivalDate,
  loadRegistrationFestival,
  registrationBlocker,
  visitorRegistrationView,
} from "@/app/lib/visitors/registration-data";
import {
  currentVisitorId,
  pendingVisitorEmail,
} from "@/app/lib/visitors/session";

export const metadata: Metadata = {
  title: "Registro para evento",
  description: "Adquiere tu entrada para nuestro próximo festival",
  robots: { index: false, follow: false },
};

/**
 * Online acreditación, in three steps: email, personal data (new visitors
 * only), tickets. Who the visitor is comes from signed cookies set by the
 * server actions, so the URL carries only the step.
 */
export default async function Page(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const step = searchParams.step || "1";
  const festival = await loadRegistrationFestival(Number(params.id));

  if (!festival) return <ResourceNotFound />;

  const blocker = registrationBlocker(festival, "online");
  if (blocker) {
    return (
      <section className="container flex flex-col gap-4 md:gap-6 items-center justify-center px-3 md:px-6 min-h-[calc(100vh-64px-180px)] md:min-h-[calc(100vh-80px-140px)]">
        <h1 className="text-lg md:text-2xl text-muted-foreground text-center leading-5">
          {blocker}
        </h1>
        <RedirectButton href="/">Volver al inicio</RedirectButton>
      </section>
    );
  }

  const registrationPath = `/festivals/${festival.id}/registration`;
  if (!["1", "2", "3"].includes(step)) redirect(registrationPath);

  const visitorId = await currentVisitorId();
  const view =
    visitorId === null
      ? null
      : await visitorRegistrationView(visitorId, festival);

  if (step === "2") {
    const email = await pendingVisitorEmail();
    if (!email) redirect(registrationPath);
    return (
      <div className="container p-4 md:p-6">
        <h1 className="mb-2 text-xl font-semibold sm:text-2xl">
          Datos Personales
        </h1>
        <VisitorRegistrationForm festivalId={festival.id} email={email} />
      </div>
    );
  }

  if (step === "3") {
    if (!view) redirect(registrationPath);
    const now = new Date();
    const taken = new Set(view.tickets.map((ticket) => ticket.date.getTime()));
    const bookableDates = festival.festivalDates.filter(
      (date) =>
        !taken.has(date.startDate.getTime()) &&
        bookableFestivalDate(festival, date.startDate, now),
    );
    return (
      <div className="container p-4 md:p-6">
        <VisitorTickets
          festival={{
            id: festival.id,
            name: festival.name,
            mascotUrl: festival.mascotUrl,
            locationLabel: festival.locationLabel,
            address: festival.address,
          }}
          view={view}
          bookableDates={bookableDates}
        />
      </div>
    );
  }

  return (
    <div className="container p-4 md:p-6">
      <EmailCard festival={festival} continueAs={view?.displayName} />
    </div>
  );
}
