"use client";

import { GiftIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import CreditGiftAmountField from "@/app/components/credit_gifts/admin/credit-gift-amount-field";
import CreditGiftConfirmDialog from "@/app/components/credit_gifts/admin/credit-gift-confirm-dialog";
import CreditGiftMessageFields from "@/app/components/credit_gifts/admin/credit-gift-message-fields";
import CreditGiftPreview from "@/app/components/credit_gifts/admin/credit-gift-preview";
import CreditGiftRecipientPicker from "@/app/components/credit_gifts/admin/credit-gift-recipient-picker";
import { formatCreditCount } from "@/app/components/credits/credit-amount";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { createCreditGiftAction } from "@/app/lib/credit_gifts/actions";
import {
  CREDIT_GIFT_OCCASION_TEMPLATES,
  type CreditGiftOccasion,
  type CreditGiftRecipientOption,
  creditGiftTotal,
  isValidCreditGiftAmount,
} from "@/app/lib/credit_gifts/definitions";
import { roundCredits } from "@/app/lib/credits/balances";

const DEFAULT_OCCASION: CreditGiftOccasion = "thanks";

/**
 * Gift credits to several participants with one message. The running total
 * (people × credits) stays in view the whole time, and nothing moves until
 * the confirm dialog restates it.
 */
export default function CreditGiftComposer() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [recipients, setRecipients] = useState<CreditGiftRecipientOption[]>([]);
  const [amount, setAmount] = useState("20");
  const [occasion, setOccasion] =
    useState<CreditGiftOccasion>(DEFAULT_OCCASION);
  const [title, setTitle] = useState(
    CREDIT_GIFT_OCCASION_TEMPLATES[DEFAULT_OCCASION].title,
  );
  const [message, setMessage] = useState(
    CREDIT_GIFT_OCCASION_TEMPLATES[DEFAULT_OCCASION].message,
  );
  const [internalNote, setInternalNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  // One per attempt: a double click lands as one gift. A thrown request keeps
  // it, since the gift may already exist and the retry should find it.
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

  const parsedAmount = Number(amount);
  const amountValid =
    amount.trim() !== "" && isValidCreditGiftAmount(parsedAmount);
  const amountPerRecipient = amountValid ? roundCredits(parsedAmount) : 0;
  const eligible = recipients.filter((recipient) => !recipient.skipReason);
  const skippedCount = recipients.length - eligible.length;
  const total = creditGiftTotal(amountPerRecipient, eligible.length);
  const sample = eligible[0] ?? null;

  const missing: string[] = [];
  if (eligible.length === 0) missing.push("al menos un participante");
  if (!amountValid) missing.push("un monto válido");
  if (!title.trim()) missing.push("un título");
  if (!message.trim()) missing.push("un mensaje");
  if (!internalNote.trim()) missing.push("la nota interna");
  const canSubmit = missing.length === 0;

  function changeOccasion(next: CreditGiftOccasion) {
    const previous = CREDIT_GIFT_OCCASION_TEMPLATES[occasion];
    const template = CREDIT_GIFT_OCCASION_TEMPLATES[next];
    // Only what the admin has not rewritten follows the new occasion.
    if (!title.trim() || title === previous.title) setTitle(template.title);
    if (!message.trim() || message === previous.message) {
      setMessage(template.message);
    }
    setOccasion(next);
  }

  function submit(confirmedTotal: number | undefined) {
    startTransition(async () => {
      try {
        const result = await createCreditGiftAction({
          recipientIds: recipients.map((recipient) => recipient.id),
          amountPerRecipient,
          occasion,
          title: title.trim(),
          message: message.trim(),
          internalNote: internalNote.trim(),
          confirmedTotal,
          idempotencyKey,
        });
        if (!result.success || !result.campaignId) {
          toast.error(result.message);
          setIdempotencyKey(crypto.randomUUID());
          return;
        }
        toast.success(result.message);
        setConfirmOpen(false);
        router.push(`/dashboard/credits/gifts/${result.campaignId}`);
      } catch (error) {
        console.error("Error creating a credit gift", error);
        toast.error("No se pudo regalar. Intentá de nuevo.");
      }
    });
  }

  return (
    <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Participantes</CardTitle>
          </CardHeader>
          <CardContent>
            <CreditGiftRecipientPicker
              recipients={recipients}
              disabled={isPending}
              onAdd={(recipient) =>
                setRecipients((current) => [...current, recipient])
              }
              onRemove={(userId) =>
                setRecipients((current) =>
                  current.filter((recipient) => recipient.id !== userId),
                )
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Créditos por persona</CardTitle>
          </CardHeader>
          <CardContent>
            <CreditGiftAmountField
              value={amount}
              onChange={setAmount}
              invalid={amount.trim() !== "" && !amountValid}
              disabled={isPending}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mensaje</CardTitle>
          </CardHeader>
          <CardContent>
            <CreditGiftMessageFields
              occasion={occasion}
              onOccasionChange={changeOccasion}
              title={title}
              onTitleChange={setTitle}
              message={message}
              onMessageChange={setMessage}
              internalNote={internalNote}
              onInternalNoteChange={setInternalNote}
              disabled={isPending}
            />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vista previa</CardTitle>
          </CardHeader>
          <CardContent>
            <CreditGiftPreview
              name={sample?.name ?? null}
              amount={amountPerRecipient}
              title={title}
              message={message}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-6">
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Participantes</dt>
              <dd className="text-right tabular-nums">{eligible.length}</dd>
              <dt className="text-muted-foreground">Créditos por persona</dt>
              <dd className="text-right tabular-nums">
                {amountValid ? formatCreditCount(amountPerRecipient) : "—"}
              </dd>
              {skippedCount > 0 && (
                <>
                  <dt className="text-muted-foreground">Omitidos</dt>
                  <dd className="text-right tabular-nums">{skippedCount}</dd>
                </>
              )}
              <dt className="font-medium">Total</dt>
              <dd className="text-right font-bold tabular-nums">
                {formatCreditCount(total)}
              </dd>
            </dl>
            <Button
              type="button"
              className="w-full"
              disabled={!canSubmit || isPending}
              onClick={() => setConfirmOpen(true)}
            >
              <GiftIcon className="mr-2 h-4 w-4" aria-hidden />
              Regalar…
            </Button>
            {!canSubmit && (
              <p className="text-xs text-muted-foreground">
                Falta {missing.join(", ")}.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <CreditGiftConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        eligibleCount={eligible.length}
        skippedCount={skippedCount}
        amountPerRecipient={amountPerRecipient}
        total={total}
        isPending={isPending}
        onConfirm={submit}
      />
    </div>
  );
}
