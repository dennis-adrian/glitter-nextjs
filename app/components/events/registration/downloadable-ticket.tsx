"use client";

import { useRef } from "react";
import * as htmlToImage from "html-to-image";
import Ticket from "@/app/components/events/registration/ticket";
import { FestivalBase } from "@/app/data/festivals/definitions";
import { TicketBase } from "@/app/data/tickets/actions";
import { VisitorWithTickets } from "@/app/data/visitors/actions";
import { toast } from "sonner";
import { Button } from "@/app/components/ui/button";
import { DownloadIcon } from "lucide-react";

type DownloadableTicketProps = {
  ticket: TicketBase;
  visitor: VisitorWithTickets;
  festival: FestivalBase;
};
export default function DownloadableTicket(props: DownloadableTicketProps) {
  const ticketRef = useRef(null);
  const downloadTicket = () => {
    if (ticketRef.current === null) {
      return;
    }

    htmlToImage
      .toPng(ticketRef.current, { cacheBust: true })
      .then((dataUrl) => {
        const link = document.createElement("a");
        link.download = `entrada festival ${props.festival.name}.png`;
        link.href = dataUrl;
        link.click();
      })
      .catch((err) => {
        toast.error("No se pudo descargar la entrada");
      });
  };

  return (
    <div className="flex flex-col items-center">
      <Ticket {...props} ticketRef={ticketRef} />
      <Button className="mt-4 mb-4 w-fit" onClick={downloadTicket}>
        <DownloadIcon className="mr-1 inline-block h-4 w-4" />
        Descargar
      </Button>
    </div>
  );
}
