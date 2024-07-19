"use client";

import EmailStep from "@/app/components/festivals/registration/steps/email-step";
import FamilyMembersStep from "@/app/components/festivals/registration/steps/family-members-step";
import TicketCreationStep from "@/app/components/festivals/registration/steps/ticket-creation-step";
import { FestivalWithDates } from "@/app/data/festivals/definitions";
import { VisitorWithTickets } from "@/app/data/visitors/actions";
import { useState } from "react";

type EventDayStepsProps = {
  email?: string;
  enableTicketCreation: boolean;
  festival: FestivalWithDates;
  numberOfVisitors?: number;
  registrationType: "individual" | "family";
  visitor?: VisitorWithTickets | null;
};

export default function EventDaySteps(props: EventDayStepsProps) {
  const [step, setStep] = useState(0);

  return (
    <div className="md:mt-6">
      {step === 0 && !props.visitor ? (
        <>
          {props.registrationType === "individual" && <EmailStep />}
          {props.registrationType === "family" && !props.numberOfVisitors && (
            <FamilyMembersStep numberOfVisitors={props.numberOfVisitors} />
          )}
        </>
      ) : null}
      {!props.enableTicketCreation &&
        props.registrationType === "family" &&
        props.numberOfVisitors && <EmailStep />}
      {props.enableTicketCreation && props.visitor && (
        <TicketCreationStep
          festival={props.festival}
          numberOfVisitors={props.numberOfVisitors}
          visitor={props.visitor}
        />
      )}
    </div>
  );
}
