import { formatDateWithTime } from "@/app/lib/formatters";
import {
  SESSION_PURCHASE_EVENT_TYPE_LABELS,
  type PurchaseActorType,
  type SessionPurchaseEventType,
} from "@/app/lib/programs/definitions";

const ACTOR_LABELS: Record<PurchaseActorType, string> = {
  buyer: "Comprador",
  admin: "Equipo",
  system: "Sistema",
};

export type EnrollmentEvent = {
  id: number;
  eventType: SessionPurchaseEventType;
  actorType: PurchaseActorType;
  actorName: string | null;
  reason: string | null;
  createdAt: Date;
};

type Props = { events: EnrollmentEvent[] };

/**
 * The audit trail, newest first.
 *
 * `session_purchase_events` has been written faithfully since Phase 3 but had
 * no reader — this is the first surface that renders it, which is what makes
 * "every admin action records actor, date, and reason" verifiable rather than
 * merely true in the database.
 */
export default function EnrollmentEventHistory({ events }: Props) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay movimientos registrados.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {events.map((event) => (
        <li key={event.id} className="border-l-2 border-border pl-3 text-sm">
          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
            <span className="font-medium break-words">
              {SESSION_PURCHASE_EVENT_TYPE_LABELS[event.eventType]}
            </span>
            <span className="text-xs whitespace-nowrap text-muted-foreground">
              {formatDateWithTime(event.createdAt)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground break-words">
            {ACTOR_LABELS[event.actorType]}
            {event.actorName ? ` · ${event.actorName}` : ""}
          </p>
          {event.reason ? (
            <p className="mt-1 break-words text-muted-foreground">
              {event.reason}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
