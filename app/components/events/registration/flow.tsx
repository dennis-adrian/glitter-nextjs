"use client";

import { FestivalBase } from "@/app/api/festivals/definitions";
import { VisitorBase } from "@/app/api/visitors/actions";
import FirstStep from "@/app/components/events/registration/first-step";
import EventRegistrationForm from "@/app/components/events/registration/form";
import { useState } from "react";

export default function RegistrationFlow({
  festival,
}: {
  festival: FestivalBase;
}) {
  const [visitor, setVisitor] = useState<VisitorBase | undefined | null>();
  const [step, setStep] = useState(0);

  const handleSuccess = (visitor: VisitorBase) => {
    setVisitor(visitor);
  };

  return step === 0 ? (
    <FirstStep onSuccess={handleSuccess} onSubmit={() => setStep(1)} />
  ) : (
    <EventRegistrationForm visitor={visitor} festival={festival} />
  );
}
