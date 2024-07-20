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
  step?: number;
  visitor?: VisitorWithTickets | null;
};

export default function EventDaySteps(props: EventDayStepsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [newVisitor, setNewVisitor] = useState<NewVisitor>({
    firstName: "",
    lastName: "",
    email: "",
    birthdate: new Date(),
    phoneNumber: "",
  });

  function updateStep(step: number) {
    console.log("updating step", step);
    const currentParams = new URLSearchParams(searchParams.toString());
    currentParams.set("step", step.toString());
    router.push(`?${currentParams.toString()}`);
  }

  function handleNameStep(firstName: string, lastName: string) {
    setNewVisitor((prevState) => ({
      ...prevState,
      firstName,
      lastName,
    }));
    updateStep(2);
  }

  function handleBirthdayStep(birthdate: Date) {
    setNewVisitor((prevState) => ({
      ...prevState,
      birthdate,
    }));
    updateStep(3);
  }

  function handlePhoneStep(phoneNumber: string) {
    setNewVisitor((prevState) => ({
      ...prevState,
      phoneNumber,
    }));
    updateStep(4);
  }

  function handleGenderStep() {}

  return (
    <div className="w-full md:mt-6">
      {(!props.step || props.step === 0) && (
        <StepZero
          numberOfVisitors={props.numberOfVisitors}
          registrationType={props.registrationType}
          visitor={props.visitor}
          onSubmit={() => updateStep(1)}
        />
      )}
      {!props.enableTicketCreation && props.email && (
        <>
          {props.step === 1 && <NameStep updateVisitor={handleNameStep} />}
          {props.step === 2 && (
            <BirthdayStep updateVisitor={handleBirthdayStep} />
          )}
          {props.step === 3 && <PhoneStep updateVisitor={handlePhoneStep} />}
          {props.step === 4 && (
            <GenderStep
              festival={props.festival}
              numberOfVisitors={props.numberOfVisitors}
              updateVisitor={handleGenderStep}
              visitor={newVisitor}
            />
          )}
          {props.step === 5 && props.visitor && (
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
