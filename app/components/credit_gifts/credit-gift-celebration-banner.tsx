"use client";

import { GiftIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { formatCreditCount } from "@/app/components/credits/credit-amount";
import { Button } from "@/app/components/ui/button";
import { markGiftsCelebratedAction } from "@/app/lib/notifications/actions";

/**
 * A calm, one-time banner for credits the team gifted. It counts as shown the
 * moment it appears, so it never follows the person from page to page; the
 * gift itself stays in the wallet and the inbox.
 */
export default function CreditGiftCelebrationBanner({
  notificationIds,
  totalCredits,
}: {
  notificationIds: number[];
  totalCredits: number;
}) {
  const [visible, setVisible] = useState(true);
  const marked = useRef(false);

  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    void markGiftsCelebratedAction(notificationIds);
  }, [notificationIds]);

  if (!visible) return null;

  return (
    <div className="border-b border-primary/15 bg-primary/5">
      <div
        role="status"
        className="mx-auto flex w-full max-w-[1440px] items-center gap-3 px-5 py-3 sm:px-8 lg:px-12 xl:px-20"
      >
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
        >
          <GiftIcon className="h-5 w-5" />
        </span>
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">
            Recibiste {formatCreditCount(totalCredits)} de regalo.
          </span>{" "}
          Ya están en tu billetera.
        </p>
        <Button asChild size="sm" variant="outline" className="shrink-0">
          <Link href="/my_credits" onClick={() => setVisible(false)}>
            Ver mi billetera
          </Link>
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          aria-label="Cerrar aviso"
          onClick={() => setVisible(false)}
        >
          <XIcon className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
