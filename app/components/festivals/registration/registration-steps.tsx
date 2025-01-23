"use client";

import { useState } from "react";

import EmailForm from "@/app/components/festivals/registration/forms/email";
import RegistrationTypeBanner from "@/app/components/festivals/registration/registration-type-banner";
import RegistrationTypeCards from "@/app/components/festivals/registration/registration-type-cards";
import FamilyMembersStep from "@/app/components/festivals/registration/steps/family-members-step";
import StepDescription from "@/app/components/festivals/registration/steps/step-description";
import { RegistrationType } from "@/app/components/festivals/registration/types";
import { stepsDescription } from "@/app/components/festivals/registration/utils";
import { NewVisitor, VisitorWithTickets } from "@/app/data/visitors/actions";
import NameForm from "@/app/components/festivals/registration/forms/name";
import TicketCreationStep from "@/app/components/festivals/registration/steps/ticket-creation-step";
import { FestivalWithDates } from "@/app/data/festivals/definitions";
import BirthdayForm from "@/app/components/festivals/registration/forms/birthday";
import PhoneForm from "@/app/components/festivals/registration/forms/phone";
import GenderForm from "@/app/components/festivals/registration/forms/gender";

export default function RegistrationSteps(props: {
  festival: FestivalWithDates;
}) {
  const [step, setStep] = useState(0);
  const [registrationType, setRegistrationType] =
    useState<RegistrationType>(null);
  const [numberOfVisitors, setNumberOfVisitors] = useState<number>(0);
  const [firstName, setFirstName] = useState<string>("");
  const [lastName, setLastName] = useState<string>("");
  const [birthdate, setBirthdate] = useState<Date | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [visitor, setVisitor] = useState<VisitorWithTickets | null>(null);

  const handleReset = () => {
    setRegistrationType(null);
    setStep(0);
    setNumberOfVisitors(0);
    setEmail("");
    setFirstName("");
    setLastName("");
    setBirthdate(null);
    setPhoneNumber("");
    setVisitor(null);
  };

  const handleVisitorSearch = (
    email: string,
    visitor?: VisitorWithTickets | null,
  ) => {
    if (visitor) {
      setVisitor(visitor);
      setStep(8);
    } else {
      setEmail(email);
      setStep(3);
    }
  };

  return (
    <>
      {!registrationType ? null : (
        <>
          <RegistrationTypeBanner
            festivalId={props.festival.id}
            type={registrationType}
            numberOfVisitors={numberOfVisitors}
            onReset={handleReset}
          />
        </>
      )}
      <StepDescription
        title={stepsDescription[step]?.title || ""}
        description={stepsDescription[step]?.description || ""}
      />
      {step === 0 && (
        <RegistrationTypeCards
          onSelect={(type: RegistrationType) => {
            setRegistrationType(type);
            if (type === "individual") {
              setStep(2);
            } else if (type === "family") {
              setStep(1);
            }
          }}
        />
      )}
      {step === 1 && (
        <FamilyMembersStep
          numberOfVisitors={numberOfVisitors}
          onContinue={(numberOfVisitors) => {
            setNumberOfVisitors(numberOfVisitors);
            setStep(2);
          }}
        />
      )}
      {step === 2 && <EmailForm onSubmit={handleVisitorSearch} />}
      {step === 3 && (
        <NameForm
          onSubmit={(firstName: string, lastName: string) => {
            setFirstName(firstName);
            setLastName(lastName);
            setStep(4);
          }}
        />
      )}
      {step === 4 && (
        <BirthdayForm
          onSubmit={(date: Date) => {
            setBirthdate(date);
            setStep(5);
          }}
        />
      )}
      {step === 5 && (
        <PhoneForm
          onSubmit={(phoneNumber: string) => {
            setPhoneNumber(phoneNumber);
            setStep(6);
          }}
        />
      )}
      {step === 6 && (
        <GenderForm
          festival={props.festival}
          numberOfVisitors={numberOfVisitors}
          visitor={{
            firstName,
            lastName,
            email,
            phoneNumber,
            birthdate: birthdate || new Date(),
          }}
        />
      )}
      {step === 8 && visitor?.id ? (
        <TicketCreationStep
          festival={props.festival}
          visitor={visitor}
          numberOfVisitors={numberOfVisitors}
        />
      ) : null}
    </>
  );
}
