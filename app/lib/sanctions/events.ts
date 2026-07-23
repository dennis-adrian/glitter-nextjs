import type {
  SanctionEventType,
  SanctionStatus,
} from "@/app/lib/sanctions/definitions";
import { db } from "@/db";
import { sanctionEvents } from "@/db/schema";

type SanctionEventTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function logSanctionEvent(
  tx: SanctionEventTx,
  input: {
    sanctionId: number;
    actorUserId?: number | null;
    eventType: SanctionEventType;
    fromStatus?: SanctionStatus | null;
    toStatus?: SanctionStatus | null;
    changes?: Record<string, unknown> | null;
    note?: string | null;
  },
) {
  await tx.insert(sanctionEvents).values({
    sanctionId: input.sanctionId,
    actorUserId: input.actorUserId ?? null,
    eventType: input.eventType,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    changes: input.changes ?? null,
    note: input.note ?? null,
  });
}
