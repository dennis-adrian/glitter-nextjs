import { BaseProfile } from "@/app/api/users/definitions";
import { db } from "@/db";
import { userStatusEvents, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export type UserStatus = BaseProfile["status"];

type StatusEventTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type LogUserStatusEventInput = {
  userId: number;
  fromStatus: UserStatus;
  toStatus: UserStatus;
  reason?: string | null;
  createdByUserId?: number | null;
};

export function verificationReasonForStatus(fromStatus: UserStatus): string {
  switch (fromStatus) {
    case "banned":
      return "Habilitación manual por administrador.";
    case "rejected":
      return "Verificación manual tras rechazo previo.";
    case "pending":
      return "Verificación manual por administrador.";
    default:
      return "Actualización de estado a verificado por administrador.";
  }
}

export async function logUserStatusEvent(
  tx: StatusEventTx,
  input: LogUserStatusEventInput,
) {
  if (input.fromStatus === input.toStatus) {
    return;
  }

  await tx.insert(userStatusEvents).values({
    userId: input.userId,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    reason: input.reason?.trim() || null,
    createdByUserId: input.createdByUserId ?? null,
  });
}

export async function updateUserStatusWithAudit(
  tx: StatusEventTx,
  {
    userId,
    fromStatus,
    toStatus,
    reason,
    createdByUserId,
    userUpdates = {},
  }: {
    userId: number;
    fromStatus: UserStatus;
    toStatus: UserStatus;
    reason?: string | null;
    createdByUserId?: number | null;
    userUpdates?: Partial<typeof users.$inferInsert>;
  },
) {
  await tx
    .update(users)
    .set({
      ...userUpdates,
      status: toStatus,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  await logUserStatusEvent(tx, {
    userId,
    fromStatus,
    toStatus,
    reason,
    createdByUserId,
  });
}
