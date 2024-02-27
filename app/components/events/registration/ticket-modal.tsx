"use client";

import { Dispatch, useRef } from "react";

import * as htmlToImage from "html-to-image";

import { FestivalBase } from "@/app/api/festivals/definitions";
import { VisitorWithTickets } from "@/app/api/visitors/actions";
import Ticket from "@/app/components/events/registration/ticket";
import { Button } from "@/app/components/ui/button";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import {
  DrawerDialog,
  DrawerDialogContent,
} from "@/components/ui/drawer-dialog";

export default function TicketModal({
  festival,
  show,
  visitor,
  onOpenChange,
}: {
  festival: FestivalBase;
  show: boolean;
  visitor: VisitorWithTickets;
  onOpenChange: Dispatch<React.SetStateAction<boolean>>;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const ticketRef = useRef(null);

  if (visitor.tickets.length < 1) {
    return null;
  }

  const sendEmail = async () => {
    await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/send`, {
      body: JSON.stringify({
        visitor,
        festival,
      }),
      method: "POST",
    });
  };

  const downloadTicket = async () => {
    const dataUrl = await htmlToImage.toPng(ticketRef.current!);

    const link = document.createElement("a");
    link.download = "glitter-ticket.png";
    link.href = dataUrl;
    link.click();
  };

  return (
    <DrawerDialog isDesktop={isDesktop} open={show} onOpenChange={onOpenChange}>
      <DrawerDialogContent isDesktop={isDesktop}>
        <div className={`${isDesktop ? "" : "px-4"} py-4`}>
          <Ticket
            onQrLoad={() => sendEmail()}
            festival={festival}
            ticketRef={ticketRef}
            visitor={visitor}
          />
          <Button className="mt-4 w-full" onClick={downloadTicket}>
            Descargar entrada
          </Button>
        </div>
      </DrawerDialogContent>
    </DrawerDialog>
  );
}
