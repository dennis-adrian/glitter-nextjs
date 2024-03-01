import { TicketBase } from "@/app/data/tickets/actions";

export function TicketStatusPill({ status }: { status: TicketBase["status"] }) {
  return (
    <div
      className={`rounded-2xl px-3 py-1 text-sm font-normal capitalize text-white ${status === "pending" ? "bg-yellow-500" : "bg-emerald-400"}`}
    >
      {status === "pending" ? "Pendiente" : "Confirmado"}
    </div>
  );
}
