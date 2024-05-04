"use client";

import { useState } from "react";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import UpdateFestivalStatusModal from "@/app/components/festivals/modals/update-festival-status";
import { FestivalBase } from "@/app/data/festivals/definitions";
import UpdateFestivalRegistrationModal from "@/app/components/festivals/modals/update-festival-registration";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import clsx from "clsx";
import FestivalSwitch from "@/app/components/festivals/switches/switch";

type FestivalSwitchesProps = {
  festival: FestivalBase;
};

export default function FestivalSwitches(props: FestivalSwitchesProps) {
  const [showFestivalUpdateModal, setShowFestivalUpdateModal] = useState(false);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);

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
    </div>
  );
}
