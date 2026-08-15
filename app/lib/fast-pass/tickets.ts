import type { FastPassPurchaseLine } from "@/app/lib/fast-pass/definitions";
import type { FastPassTicketStatus } from "@/app/lib/fast-pass/definitions";
import { generateTicketCode } from "@/app/lib/fast-pass/tokens";

export type FastPassTicketInsertPayload = {
  purchaseLineId: number;
  festivalDateId: number;
  code: string;
  status: FastPassTicketStatus;
  holderFirstName: string | null;
  holderLastName: string | null;
  holderEmail: string | null;
  responsibleChildCount: number;
  issuedAt: Date;
  activatedAt: Date | null;
  festivalTicketId: number | null;
};

/** Builds the row payload for idempotent ticket issuance. */
export function buildTicketInsertPayload(
  line: Pick<
    FastPassPurchaseLine,
    | "id"
    | "holderFirstName"
    | "holderLastName"
    | "holderEmail"
    | "responsibleChildCount"
    | "festivalTicketId"
  >,
  festivalDateId: number,
  options: {
    status: FastPassTicketStatus;
    now?: Date;
    code?: string;
  },
): FastPassTicketInsertPayload {
  const now = options.now ?? new Date();
  const activated = options.status === "activated";

  return {
    purchaseLineId: line.id,
    festivalDateId,
    code: options.code ?? generateTicketCode(),
    status: options.status,
    holderFirstName: line.holderFirstName,
    holderLastName: line.holderLastName,
    holderEmail: line.holderEmail,
    responsibleChildCount: line.responsibleChildCount,
    festivalTicketId: line.festivalTicketId,
    issuedAt: now,
    activatedAt: activated ? now : null,
  };
}
