"use client";

import EmailStep from "@/app/components/festivals/registration/steps/email-step";
import FamilyMembersStep from "@/app/components/festivals/registration/steps/family-members-step";
import TicketCreationStep from "@/app/components/festivals/registration/steps/ticket-creation-step";
import { FestivalWithDates } from "@/app/data/festivals/definitions";
import { VisitorWithTickets } from "@/app/data/visitors/actions";
import { useState } from "react";

type EventDayStepsProps = {
  enableTicketCreation: boolean;
  festival: FestivalWithDates;
  registrationType: "individual" | "family";
  email?: string;
  visitor?: VisitorWithTickets | null;
};

export default function EventDaySteps(props: EventDayStepsProps) {
  const [step, setStep] = useState(0);

  return (
    <div className="mt-8">
      {step === 0 && !props.visitor ? (
        <>
          {props.registrationType === "individual" && <EmailStep />}
          {props.registrationType === "family" && <FamilyMembersStep />}
        </>
      ) : null}
      {props.enableTicketCreation && props.visitor && (
        <TicketCreationStep festival={props.festival} visitor={props.visitor} />
      )}
    </div>
  );
}
