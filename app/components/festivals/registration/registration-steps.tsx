"use client";

import { useEffect, useState } from "react";

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

type RegistrationInfo = {
  step: number;
  type: RegistrationType;
  numberOfVisitors: number;
};

const initialNewVisitor: NewVisitor = {
  firstName: "",
  lastName: "",
  email: "",
  phoneNumber: "",
  birthdate: new Date(),
  gender: "other",
};

const initialRegistrationInfo: RegistrationInfo = {
  step: 0,
  type: null,
  numberOfVisitors: 0,
};

export default function RegistrationSteps(props: {
  festival: FestivalWithDates;
}) {
  const [registrationInfo, setRegistrationInfo] = useState<RegistrationInfo>(
    initialRegistrationInfo,
  );
  const [newVisitor, setNewVisitor] = useState<NewVisitor>(initialNewVisitor);
  const [returningVisitor, setReturningVisitor] =
    useState<VisitorWithTickets | null>(null);

  useEffect(() => {
    if (registrationInfo.type === "individual") {
      setRegistrationInfo((prev) => ({
        ...prev,
        step: 2,
      }));
    } else if (registrationInfo.type === "family") {
      setRegistrationInfo((prev) => ({
        ...prev,
        step: 1,
      }));
    }
  }, [registrationInfo.type]);

  const handleReset = () => {
    setRegistrationInfo(initialRegistrationInfo);
    setReturningVisitor(null);
    setNewVisitor(initialNewVisitor);
  };

  const handleVisitorSearch = (
    email: string,
    visitor?: VisitorWithTickets | null,
  ) => {
    if (visitor) {
      setReturningVisitor(visitor);
      setRegistrationInfo({ ...registrationInfo, step: 7 });
    } else {
      setNewVisitor({ ...newVisitor, email });
      setRegistrationInfo({ ...registrationInfo, step: 3 });
    }
  };

  return (
    <>
      {!registrationInfo.type ? null : (
        <>
          <RegistrationTypeBanner
            festivalId={props.festival.id}
            type={registrationInfo.type}
            numberOfVisitors={registrationInfo.numberOfVisitors}
            onReset={handleReset}
          />
        </>
      )}
      <StepDescription
        title={stepsDescription[registrationInfo.step]?.title || ""}
        description={stepsDescription[registrationInfo.step]?.description || ""}
      />
      {registrationInfo.step === 0 && (
        <RegistrationTypeCards
          onSelect={(type: RegistrationType) => {
            setRegistrationInfo({ ...registrationInfo, type });
          }}
        />
      )}
      {registrationInfo.step === 1 && (
        <FamilyMembersStep
          numberOfVisitors={registrationInfo.numberOfVisitors}
          onContinue={(numberOfVisitors) => {
            setRegistrationInfo((prev) => ({
              ...prev,
              numberOfVisitors,
              step: 2,
            }));
          }}
        />
      )}
      {registrationInfo.step === 2 && (
        <EmailForm onSubmit={handleVisitorSearch} />
      )}
      {registrationInfo.step === 3 && (
        <NameForm
          onSubmit={(firstName: string, lastName: string) => {
            setNewVisitor({ ...newVisitor, firstName, lastName });
            setRegistrationInfo({ ...registrationInfo, step: 4 });
          }}
        />
      )}
      {registrationInfo.step === 4 && (
        <BirthdayForm
          onSubmit={(date: Date) => {
            setNewVisitor({ ...newVisitor, birthdate: date });
            setRegistrationInfo({ ...registrationInfo, step: 5 });
          }}
        />
      )}
      {registrationInfo.step === 5 && (
        <PhoneForm
          onSubmit={(phoneNumber: string) => {
            setNewVisitor({ ...newVisitor, phoneNumber });
            setRegistrationInfo({ ...registrationInfo, step: 6 });
          }}
        />
      )}
      {registrationInfo.step === 6 && (
        <GenderForm
          festival={props.festival}
          numberOfVisitors={registrationInfo.numberOfVisitors}
          visitor={newVisitor}
          onSuccess={(visitor: VisitorWithTickets) => {
            setReturningVisitor(visitor);
            setRegistrationInfo({ ...registrationInfo, step: 7 });
          }}
        />
      )}
      {registrationInfo.step === 7 && returningVisitor?.id ? (
        <TicketCreationStep
          festival={props.festival}
          visitor={returningVisitor}
          numberOfVisitors={registrationInfo.numberOfVisitors}
        />
      ) : null}
    </>
  );
}
