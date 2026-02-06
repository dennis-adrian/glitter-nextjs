"use client";
import { ActivityDetailsWithParticipants } from "@/app/lib/festivals/definitions";
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
        {detail.imageUrl ? (
          <Image
            src={detail.imageUrl}
            alt={`Sticker Print ${detail.id}`}
            width={320}
            height={480}
          />
        ) : (
          <div className="w-[320px] h-[480px] bg-muted rounded flex items-center justify-center text-muted-foreground text-sm">
            Sin imagen
          </div>
        )}
        {selected && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <span className="text-white text-lg">Seleccionado</span>
          </div>
        )}
      </div>
      {detail.participants.length > 0 ? (
        <p className="text-[10px] md:text-xs text-muted-foreground">
          {detail.participants
            .map((participant, index) => {
              const participantName = participant.user.displayName;
              const participantNumber = index + 1;

              return `${participantNumber}. ${participantName}`;
            })
            .join(", ")}
        </p>
      ) : (
        <p className="text-[10px] md:text-xs text-muted-foreground">
          Sin participantes
        </p>
      )}
    </div>
  );
}
