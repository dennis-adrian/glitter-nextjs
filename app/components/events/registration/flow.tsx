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
  const [email, setEmail] = useState<string>("");

  const handleSuccess = (visitor: VisitorBase) => {
    setVisitor(visitor);
  };

  return email && email.length > 0 ? (
    <div className="container px-3 sm:px-8">
      <EventRegistrationForm
        email={email}
        visitor={visitor}
        festival={festival}
      />
    </div>
  ) : (
    <FirstStep
      onSuccess={handleSuccess}
      onSubmit={(value) => setEmail(value)}
    />
  );
}
