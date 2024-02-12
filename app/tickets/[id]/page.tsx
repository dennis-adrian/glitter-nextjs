import { fetchTicket } from "@/app/data/tickets/actions";
import Image from "next/image";

export default async function Page({ params }: { params: { id: string } }) {
  const ticket = await fetchTicket(parseInt(params.id));
  if (!ticket) {
    return (
      <div>
        <h1>404 - Ticket Not Found</h1>
      </div>
    );
  }

  return (
    <div>
      <Image alt="QR Code" src={ticket.qrcode} width={300} height={300} />
    </div>
  );
}
