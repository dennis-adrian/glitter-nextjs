"use client";

import { useState } from "react";

import UpdateFestivalStatusModal from "@/app/components/festivals/modals/update-festival-status";
import UpdateFestivalRegistrationModal from "@/app/components/festivals/modals/update-festival-registration";
import clsx from "clsx";
import FestivalSwitch from "@/app/components/festivals/switches/switch";
import UpdateEventRegistrationModal from "@/app/components/festivals/modals/update-event-day-registration";
import { FestivalBase } from "@/app/lib/festivals/definitions";

type FestivalSwitchesProps = {
  festival: FestivalBase;
};

export default function FestivalSwitches(props: FestivalSwitchesProps) {
  const [showFestivalUpdateModal, setShowFestivalUpdateModal] = useState(false);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [showEventDayRegistrationModal, setShowEventDayRegistrationModal] =
    useState(false);

  return (
    <div
      className={clsx({
        "text-muted-foreground": props.festival.status === "archived",
      })}
    >
      <div className="p-4 border rounded-lg space-y-2">
        <FestivalSwitch
          checked={props.festival.status === "active"}
          disabled={props.festival.status === "archived"}
          festival={props.festival}
          label="Activar"
          tooltipContent="No se puede activar un festival archivado"
          onChange={() => setShowFestivalUpdateModal(true)}
        />
        <FestivalSwitch
          checked={props.festival.publicRegistration}
          disabled={props.festival.status !== "active"}
          festival={props.festival}
          label="Acreditación"
          tooltipContent="Activa el festival para habilitar acreditaciones"
          onChange={() => setShowRegistrationModal(true)}
        />
        <FestivalSwitch
          checked={props.festival.eventDayRegistration}
          disabled={!props.festival.publicRegistration}
          festival={props.festival}
          label="Habilitar registro en puerta"
          tooltipContent="La acreditación debe estar activa para habilitar el registro en puerta"
          onChange={() => setShowEventDayRegistrationModal(true)}
        />
      </div>
      <UpdateFestivalStatusModal
        open={showFestivalUpdateModal}
        festival={props.festival}
        setOpen={setShowFestivalUpdateModal}
      />
      <UpdateFestivalRegistrationModal
        open={showRegistrationModal}
        festival={props.festival}
        setOpen={setShowRegistrationModal}
      />
      <UpdateEventRegistrationModal
        open={showEventDayRegistrationModal}
        festival={props.festival}
        setOpen={setShowEventDayRegistrationModal}
      />
    </div>
  );
}
