"use client";

import StickerPrintDesignSelectable from "@/app/(routes)/festivals/[id]/participants_activity/sticker-print-design-selectable";
import { Button } from "@/app/components/ui/button";
import {
  ActivityDetailsWithParticipants,
  FestivalActivityWithDetailsAndParticipants,
} from "@/app/data/festivals/definitions";
import { ArrowDownToLineIcon } from "lucide-react";
import { useState } from "react";

type ActivityDetailsProps = {
  activity: FestivalActivityWithDetailsAndParticipants;
};

export default function ActivityDetails({ activity }: ActivityDetailsProps) {
  const [selectedDesign, setSelectedDesign] =
    useState<ActivityDetailsWithParticipants | null>(null);

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
        {activity.details.map((detail) => (
          <StickerPrintDesignSelectable
            key={detail.id}
            detail={detail}
            selected={selectedDesign?.id === detail.id}
            setSelected={setSelectedDesign}
          />
        ))}
      </div>
      <div className="flex justify-center mt-2">
        <Button className="w-full md:max-w-[400px] self-end">
          <span>Guardar selección</span>
          <ArrowDownToLineIcon className="ml-2 w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
