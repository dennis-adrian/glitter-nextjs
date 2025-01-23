"use client";

import { useState } from "react";

import EmailForm from "@/app/components/festivals/registration/forms/email";
import RegistrationTypeBanner from "@/app/components/festivals/registration/registration-type-banner";
import RegistrationTypeCards from "@/app/components/festivals/registration/registration-type-cards";
import FamilyMembersStep from "@/app/components/festivals/registration/steps/family-members-step";
import StepDescription from "@/app/components/festivals/registration/steps/step-description";
import { RegistrationType } from "@/app/components/festivals/registration/types";
import { stepsDescription } from "@/app/components/festivals/registration/utils";

export default function RegistrationSteps(props: { festivalId: number }) {
  const [step, setStep] = useState(0);
  const [registrationType, setRegistrationType] =
    useState<RegistrationType>(null);
  const [numberOfVisitors, setNumberOfVisitors] = useState<number>(0);

  const handleReset = () => {
    setRegistrationType(null);
    setStep(0);
    setNumberOfVisitors(0);
  };

  return (
    <>
      {!registrationType ? null : (
        <>
          <RegistrationTypeBanner
            festivalId={props.festivalId}
            type={registrationType}
            numberOfVisitors={numberOfVisitors}
            onReset={handleReset}
          />
        </>
      )}
      <StepDescription
        title={stepsDescription[step].title}
        description={stepsDescription[step].description}
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
      {step === 2 && <EmailForm onSubmit={() => {}} />}
    </>
  );
}
