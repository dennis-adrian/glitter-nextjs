import Tickets from "@/app/components/events/registration/tickets";
import StepDescription from "@/app/components/festivals/registration/steps/step-description";
import { FestivalWithDates } from "@/app/data/festivals/definitions";
import { VisitorWithTickets } from "@/app/data/visitors/actions";
import { getVisitorFestivalTickets } from "@/app/data/visitors/helpers";

type CreatedTicketProps = {
  festival: FestivalWithDates;
  visitor: VisitorWithTickets;
};

export default function CreatedTicket(props: CreatedTicketProps) {
  const tickets = getVisitorFestivalTickets(props.visitor, props.festival);

  return (
    <>
      <StepDescription
        title={`¡Bienvenido, ${props.visitor.firstName}!`}
        description="Tus datos fueron guardados para que puedas tener una mejor experiencia en próximos eventos"
      />
      <div className="text-center my-4">
        Muestra tu entrada en puerta para ingresar al evento
      </div>
      {tickets.length > 0 && (
        <Tickets
          visitor={props.visitor}
          tickets={tickets}
          festival={props.festival}
        />
      )}
    </>
  );
}
