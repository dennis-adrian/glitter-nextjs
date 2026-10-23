import Link from "next/link";

import {
  type CreditLedgerKind,
  isOpenGiftGrant,
} from "@/app/lib/credits/admin-definitions";

/**
 * Where "Revertir" would be for a gift's grant: a gift is taken back from its
 * own page, which also withdraws the notice and tells the participant.
 */
export default function CreditGiftRevertHint({
  row,
}: {
  row: {
    kind: CreditLedgerKind;
    isReverted: boolean;
    creditGiftId: number | null;
  };
}) {
  if (!isOpenGiftGrant(row)) return null;
  return (
    <Link
      href={`/dashboard/credits/gifts/${row.creditGiftId}`}
      className="text-xs text-primary hover:underline"
    >
      Retirar desde el regalo
    </Link>
  );
}
