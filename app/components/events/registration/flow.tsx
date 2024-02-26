"use client";

import { FestivalBase } from "@/app/api/festivals/definitions";
import { VisitorBase, VisitorWithTickets } from "@/app/api/visitors/actions";
import FirstStep from "@/app/components/events/registration/first-step";
import EventRegistrationForm from "@/app/components/events/registration/form";
import { FestivalInfo } from "@/app/components/landing/festival-info-card";
import Image from "next/image";
import { useState } from "react";
import TicketModal from "./ticket-modal";

export default function RegistrationFlow({
  festival,
}: {
  festival: FestivalBase;
}) {
  const [visitor, setVisitor] = useState<
    VisitorWithTickets | undefined | null
  >();
  const [email, setEmail] = useState<string>("");
  const [showModal, setShowModal] = useState(false);

  const handleEmailSuccess = (visitor: VisitorWithTickets) => {
    setVisitor(visitor);
  };

  const handleRegistrationSuccess = (visitor: VisitorWithTickets) => {
    setVisitor(visitor);
    setShowModal(true);
  };

  return (
    <div>
      {email && email.length > 0 ? (
        <div className="container grid grid-cols-1 gap-y-4 px-3 sm:grid-cols-3 sm:px-8 md:gap-4">
          <div className="text-primary-foreground relative mt-5 flex w-full items-center justify-center p-6 sm:mt-0">
            <Image
              className="-z-10 rounded-2xl object-cover"
              src="/img/bg_w_1280.png"
              alt="Festival Image"
              quality={100}
              fill
            />
            <div className="flex items-center gap-2 sm:gap-4 md:flex-col">
              <div className="relative hidden h-28 w-28 md:block">
                <Image
                  src="/img/mascot.png"
                  alt="Mascota Glitter"
                  quality={100}
                  fill
                />
              </div>
              <div>
                <h1 className="text-center text-2xl font-semibold">
                  {festival.name}
                </h1>
                <FestivalInfo
                  className="py-2 text-sm md:text-sm"
                  festival={festival}
                />
              </div>
            </div>
          </div>
          <div className="col-span-2">
            <h1 className="mb-4 text-xl font-semibold sm:text-2xl">
              Registro de Asistencia
            </h1>
            <EventRegistrationForm
              email={email}
              visitor={visitor}
              festival={festival}
              onSuccess={handleRegistrationSuccess}
            />
          </div>
        </div>
      ) : (
        <FirstStep
          onSuccess={handleEmailSuccess}
          onSubmit={(value) => setEmail(value)}
        />
      )}
      {visitor && (
        <TicketModal
          show={showModal}
          visitor={visitor}
          festival={festival}
          onOpenChange={setShowModal}
        />
      )}
    </div>
  );
}
