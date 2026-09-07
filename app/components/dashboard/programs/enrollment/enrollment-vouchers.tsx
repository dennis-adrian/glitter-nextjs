"use client";

import Image from "next/image";
import { useState } from "react";

import { formatDateWithTime } from "@/app/lib/formatters";

export type EnrollmentVoucher = {
  version: number;
  fileUrl: string;
  createdAt: Date;
};

type Props = { vouchers: EnrollmentVoucher[] };

/**
 * Proof of payment, newest first.
 *
 * Only the current version is shown expanded — it is the one any decision is
 * taken on — while earlier ones stay one click away, because the immutable
 * history is what makes a disputed payment resolvable.
 */
export default function EnrollmentVouchers({ vouchers }: Props) {
  const [showHistory, setShowHistory] = useState(false);

  if (vouchers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay comprobantes.
      </p>
    );
  }

  const [current, ...previous] = vouchers;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Versión {current.version} · {formatDateWithTime(current.createdAt)}
      </p>

      <a
        href={current.fileUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="block"
      >
        {/* Intrinsic size is a hint; the classes let it shrink on a phone
            instead of forcing the page wider than the viewport. */}
        <Image
          src={current.fileUrl}
          alt={`Comprobante versión ${current.version}`}
          width={320}
          height={420}
          className="mx-auto h-auto w-full max-w-xs rounded-md border"
        />
      </a>

      {previous.length > 0 ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowHistory((open) => !open)}
            className="text-xs underline underline-offset-2"
          >
            {showHistory
              ? "Ocultar versiones anteriores"
              : `Ver ${previous.length} versión(es) anterior(es)`}
          </button>
          {showHistory ? (
            <ul className="space-y-1">
              {previous.map((voucher) => (
                <li key={voucher.version}>
                  <a
                    href={voucher.fileUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs underline underline-offset-2"
                  >
                    v{voucher.version} · {formatDateWithTime(voucher.createdAt)}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
