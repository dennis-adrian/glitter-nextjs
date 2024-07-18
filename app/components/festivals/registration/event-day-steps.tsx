"use client";

import EmailStep from "@/app/components/festivals/registration/steps/email-step";
import TicketCreationStep from "@/app/components/festivals/registration/steps/ticket-creation-step";
import { FestivalWithDates } from "@/app/data/festivals/definitions";
import { VisitorWithTickets } from "@/app/data/visitors/actions";
import { useState } from "react";

type EventDayStepsProps = {
  festival: FestivalWithDates;
};

export default function EventDaySteps(props: EventDayStepsProps) {
  const [step, setStep] = useState(0);
  const [visitor, setVisitor] = useState<VisitorWithTickets | null>(null);

  if (visitor) {
    // console.log("visitor", visitor);
  }

  return (
    <div className="mt-8">
      {step === 0 && !visitor && <EmailStep setVisitor={setVisitor} />}
      {visitor && (
        <TicketCreationStep festival={props.festival} visitor={visitor} />
      )}
    </div>
  );
}
