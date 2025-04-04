"use client";

import { BaseProfile } from "@/app/api/users/definitions";
import { ActivityDetailsWithParticipants } from "@/app/data/festivals/definitions";
import Image from "next/image";

type StickerPrintDesignSelectableProps = {
  detail: ActivityDetailsWithParticipants;
  selected: boolean;
  setSelected: (detail: ActivityDetailsWithParticipants) => void;
};

export default function StickerPrintDesignSelectable({
  detail,
  selected,
  setSelected,
}: StickerPrintDesignSelectableProps) {
  return (
    <div className="flex flex-col gap-1 relative" key={detail.id}>
      <div className="relative" onClick={() => setSelected(detail)}>
        <Image
          // TODO: Add a blur image when loading and a skeleton
          src={detail.imageUrl ?? ""}
          alt={`Sticker Print ${detail.id}`}
          width={320}
          height={480}
        />
        {selected && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <span className="text-white text-lg">Seleccionado</span>
          </div>
        )}
      </div>
      {detail.participants.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {detail.participants.length} participantes
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Sin participantes</p>
      )}
    </div>
  );
}
