"use client";

import BirthdayStep from "@/app/components/festivals/registration/steps/brithday-step";
import CreatedTicket from "@/app/components/festivals/registration/steps/created-ticket";
import GenderStep from "@/app/components/festivals/registration/steps/gender-step";
import NameStep from "@/app/components/festivals/registration/steps/name-step";
import PhoneStep from "@/app/components/festivals/registration/steps/phone-step";
import StepZero from "@/app/components/festivals/registration/steps/step-zero";
import TicketCreationStep from "@/app/components/festivals/registration/steps/ticket-creation-step";
import { FestivalWithDates } from "@/app/data/festivals/definitions";
import { NewVisitor, VisitorWithTickets } from "@/app/data/visitors/actions";
import { useRouter, useSearchParams } from "next/navigation";
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
  const [newVisitor, setNewVisitor] = useState<NewVisitor>({
    firstName: "",
    lastName: "",
    email: "",
    birthdate: new Date(),
    phoneNumber: "",
  });

  function handleNameStep(firstName: string, lastName: string) {
    setNewVisitor((prevState) => ({
      ...prevState,
      firstName,
      lastName,
    }));
    setStep(2);
  }

  function handleBirthdayStep(birthdate: Date) {
    setNewVisitor((prevState) => ({
      ...prevState,
      birthdate,
    }));
    setStep(3);
  }

  function handlePhoneStep(phoneNumber: string) {
    setNewVisitor((prevState) => ({
      ...prevState,
      phoneNumber,
    }));
    setStep(4);
  }

  function handleGenderStep() {
    setNewVisitor({
      firstName: "",
      lastName: "",
      email: "",
      birthdate: new Date(),
      phoneNumber: "",
    });
    setStep(5);
  }

  console.log(newVisitor);

  return (
    <div className="w-full md:mt-6">
      {step === 0 && (
        <StepZero
          numberOfVisitors={props.numberOfVisitors}
          registrationType={props.registrationType}
          visitor={props.visitor}
          onSubmit={() => setStep(1)}
        />
      )}
      {!props.enableTicketCreation && props.email && (
        <>
          {step === 1 && <NameStep updateVisitor={handleNameStep} />}
          {step === 2 && <BirthdayStep updateVisitor={handleBirthdayStep} />}
          {step === 3 && <PhoneStep updateVisitor={handlePhoneStep} />}
          {step === 4 && (
            <GenderStep
              festival={props.festival}
              numberOfVisitors={props.numberOfVisitors}
              updateVisitor={handleGenderStep}
              visitor={newVisitor}
            />
          )}
          {step === 5 && props.visitor && (
            <CreatedTicket festival={props.festival} visitor={props.visitor} />
          )}
        </>
      )}
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
