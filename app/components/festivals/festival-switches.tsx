"use client";

import { useState } from "react";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import UpdateFestivalStatusModal from "@/app/components/festivals/modals/update-festival-status";
import { FestivalBase } from "@/app/data/festivals/definitions";
import UpdateFestivalRegistrationModal from "@/app/components/festivals/modals/update-festival-registration";

type FestivalSwitchesProps = {
  festival: FestivalBase;
};

export default function FestivalSwitches(props: FestivalSwitchesProps) {
  const [showFestivalUpdateModal, setShowFestivalUpdateModal] = useState(false);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);

  return (
    <div>
      <div className="p-4 border rounded-lg space-y-2">
        <div className="flex items-center space-x-2">
          <Label htmlFor="activate">Activar</Label>
          <Switch
            id="activate"
            checked={props.festival.status === "active"}
            onCheckedChange={() => setShowFestivalUpdateModal(true)}
          />
        </div>
        <div className="flex items-center space-x-2">
          <Label htmlFor="registration">Acreditación</Label>
          <Switch
            id="registration"
            checked={props.festival.publicRegistration}
            onCheckedChange={() => setShowRegistrationModal(true)}
          />
        </div>
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
