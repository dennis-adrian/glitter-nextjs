"use client";

import ArchiveFestivalModal from "@/app/components/festivals/modals/archive-festival";
import { Button } from "@/app/components/ui/button";
import { FestivalBase } from "@/app/data/festivals/definitions";
import { ArchiveIcon } from "lucide-react";
import { useState } from "react";

type ArchiveFestivalProps = {
  festival: FestivalBase;
};

export default function ArchiveFestival(props: ArchiveFestivalProps) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      {props.festival.status !== "archived" && (
        <Button
          className="w-full"
          variant="outline"
          onClick={() => setShowModal(true)}
        >
          <ArchiveIcon className="w-5 h-5 mr-2" />
          Archivar
        </Button>
      )}
      <ArchiveFestivalModal
        open={showModal}
        festival={props.festival}
        setOpen={setShowModal}
      />
    </>
  );
}
