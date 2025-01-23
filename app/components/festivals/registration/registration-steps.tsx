"use client";

import { useState } from "react";

import RegistrationTypeBanner from "@/app/components/festivals/registration/registration-type-banner";
import StepDescription from "@/app/components/festivals/registration/steps/step-description";
import { RegistrationType } from "@/app/components/festivals/registration/types";
import RegistrationTypeCards from "@/app/components/festivals/registration/registration-type-cards";

export default function RegistrationSteps(props: { festivalId: number }) {
  const [step, setStep] = useState(0);
  const [registrationType, setRegistrationType] =
    useState<RegistrationType>(null);
  const [numberOfVisitors, setNumberOfVisitors] = useState<number>(0);

  return (
    <>
      {!registrationType ? null : (
        <>
          <RegistrationTypeBanner
            festivalId={props.festivalId}
            type={registrationType}
            numberOfVisitors={numberOfVisitors}
            onReset={() => {
              setRegistrationType(null);
              setStep(0);
            }}
          />
        </>
      )}
      <StepDescription
        title="¿Cómo vienes al evento?"
        description="Elige la opción que mejor refleje tu situación"
      />
      {step === 0 && (
        <RegistrationTypeCards
          onSelect={(type: RegistrationType) => {
            setRegistrationType(type);
            setStep(1);
          }}
        />
      )}
    </>
  );
}
