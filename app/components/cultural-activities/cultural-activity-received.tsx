"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { CheckIcon, MailIcon } from "lucide-react";

import { Button, buttonVariants } from "@/app/components/ui/button";
import {
  CULTURAL_ACTIVITY_COPY,
  formatContactPhone,
} from "@/app/lib/live_acts/definitions";

/**
 * After sending. It must not say the activity is accepted: a honeypot lands
 * here too.
 */
export default function CulturalActivityReceived({
  actName,
  email,
  phone,
  onApplyAnother,
}: {
  actName: string;
  email: string;
  phone: string;
  onApplyAnother: () => void;
}) {
  const copy = CULTURAL_ACTIVITY_COPY;
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-1 justify-center bg-brand-lavender px-3 py-8 md:py-16">
      <div
        role="status"
        className="flex h-fit w-full max-w-lg flex-col items-center gap-4 rounded-[20px] border border-brand-border bg-brand-card px-5 py-8 text-center md:p-10"
      >
        <div className="flex size-14 items-center justify-center rounded-full bg-success-500 text-green-900">
          <CheckIcon className="size-6" aria-hidden />
        </div>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-[30px] leading-9 font-extrabold tracking-[-0.5px] text-brand-ink outline-none"
        >
          {copy.receivedTitle}
        </h1>
        <p className="break-words text-brand-neutral-strong">
          Gracias por contarnos sobre <strong>{actName}</strong>.
        </p>
        <p className="text-sm leading-5 break-words text-brand-neutral">
          {copy.receivedReview}
        </p>
        <div className="flex w-full items-start gap-2.5 rounded-xl bg-surface-muted px-4 py-3 text-left text-sm leading-5 text-brand-neutral-strong">
          <MailIcon
            className="mt-0.5 size-4 flex-none text-brand-primary"
            aria-hidden
          />
          <span className="min-w-0 break-words">
            Si es seleccionada, te escribimos a{" "}
            <strong className="wrap-anywhere">{email}</strong> o al{" "}
            <strong className="whitespace-nowrap">
              {formatContactPhone(phone)}
            </strong>
            .
          </span>
        </div>
        <Link
          href="/"
          className={buttonVariants({
            variant: "outline",
            size: "lg",
            wrap: true,
            className: "w-full",
          })}
        >
          {copy.backHome}
        </Link>
        <Button
          type="button"
          variant="link"
          wrap
          className="text-brand-primary"
          onClick={onApplyAnother}
        >
          {copy.applyAnother}
        </Button>
      </div>
    </div>
  );
}
