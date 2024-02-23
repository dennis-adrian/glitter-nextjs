"use client";

import { FestivalBase } from "@/app/api/festivals/definitions";
import { VisitorBase } from "@/app/api/visitors/actions";
import FirstStep from "@/app/components/events/registration/first-step";
import EventRegistrationForm from "@/app/components/events/registration/form";
import { FestivalInfo } from "@/app/components/landing/festival-info-card";
import Image from "next/image";
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
    <div className="container grid grid-cols-1 sm:grid-cols-3 px-3 sm:px-8 gap-y-4 md:gap-4">
      <div className="flex justify-center items-center relative mt-5 sm:mt-0 w-full text-primary-foreground p-6">
        <Image
          className="rounded-2xl object-cover -z-10"
          src="/img/bg_w_1280.png"
          alt="Festival Image"
          quality={100}
          fill
        />
        <div className="flex md:flex-col items-center gap-2 sm:gap-4">
          <div className="relative hidden md:block w-28 h-28">
            <Image
              src="/img/mascot.png"
              alt="Mascota Glitter"
              quality={100}
              fill
            />
          </div>
          <div>
            <h1 className="font-semibold text-2xl text-center">
              {festival.name}
            </h1>
            <FestivalInfo
              className="text-sm md:text-sm py-2"
              festival={festival}
            />
          </div>
        </div>
      </div>
      <div className="col-span-2">
        <h1 className="font-semibold text-xl sm:text-2xl mb-4">
          Registro de Asistencia
        </h1>
        <EventRegistrationForm
          email={email}
          visitor={visitor}
          festival={festival}
        />
      </div>
    </div>
  ) : (
    <FirstStep
      onSuccess={handleSuccess}
      onSubmit={(value) => setEmail(value)}
    />
  );
}
