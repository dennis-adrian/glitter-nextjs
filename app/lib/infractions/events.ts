import type { InfractionStatus } from "@/app/lib/infractions/definitions";
import { db } from "@/db";
import { infractionEvents, infractionEventTypeEnum } from "@/db/schema";

type InfractionEventTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type InfractionEventType = (typeof infractionEventTypeEnum.enumValues)[number];

export async function logInfractionEvent(
  tx: InfractionEventTx,
  input: {
    infractionId: number;
    actorUserId?: number | null;
    eventType: InfractionEventType;
    fromStatus?: InfractionStatus | null;
    toStatus?: InfractionStatus | null;
    changes?: Record<string, unknown> | null;
    note?: string | null;
  },
) {
  await tx.insert(infractionEvents).values({
    infractionId: input.infractionId,
    actorUserId: input.actorUserId ?? null,
    eventType: input.eventType,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    changes: input.changes ?? null,
    note: input.note ?? null,
  });
}
