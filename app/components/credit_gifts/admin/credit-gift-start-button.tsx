import { GiftIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/app/components/ui/button";

/**
 * "Regalar créditos", disabled with its reason rather than hidden, so a
 * festival admin or a not-yet-launched wallet reads as a rule, not a bug.
 */
export default function CreditGiftStartButton({
  blocker,
}: {
  blocker: string | null;
}) {
  if (blocker) {
    return (
      <div className="flex flex-col items-start gap-1 sm:items-end">
        <Button disabled>
          <GiftIcon className="mr-2 h-4 w-4" aria-hidden />
          Regalar créditos
        </Button>
        <p className="max-w-xs text-xs text-muted-foreground sm:text-right">
          {blocker}
        </p>
      </div>
    );
  }
  return (
    <Button asChild>
      <Link href="/dashboard/credits/gifts/new">
        <GiftIcon className="mr-2 h-4 w-4" aria-hidden />
        Regalar créditos
      </Link>
    </Button>
  );
}
