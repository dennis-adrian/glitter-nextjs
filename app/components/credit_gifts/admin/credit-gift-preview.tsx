"use client";

import CreditGiftEmailPreview from "@/app/components/credit_gifts/admin/credit-gift-email-preview";
import CreditAmount, {
  formatCreditCount,
} from "@/app/components/credits/credit-amount";
import NotificationItem from "@/app/components/notifications/notification-item";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/app/components/ui/tabs";
import {
  CREDIT_GIFT_WALLET_LABEL,
  isValidCreditGiftAmount,
  personalizeCreditGiftMessage,
} from "@/app/lib/credit_gifts/definitions";
import { NOTIFICATION_SENDER_NAME } from "@/app/lib/notifications/definitions";

type CreditGiftPreviewProps = {
  /**
   * What `{nombre}` becomes for the sample recipient, exactly as the send
   * fills it: null for a profile without a name, and before anyone is added.
   */
  name: string | null;
  /** Who the sample recipient is, for the admin; may be their email. */
  sampleLabel: string | null;
  amount: number;
  title: string;
  message: string;
};

/**
 * What one recipient will see, in the three places a gift lands. Rendered for
 * the first person on the list, personalized the way the send will do it.
 */
export default function CreditGiftPreview({
  name,
  sampleLabel,
  amount,
  title,
  message,
}: CreditGiftPreviewProps) {
  const ready =
    isValidCreditGiftAmount(amount) &&
    title.trim() !== "" &&
    message.trim() !== "";
  if (!ready) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Completá el monto, el título y el mensaje para ver cómo lo recibe cada
        participante.
      </p>
    );
  }
  const personalized = personalizeCreditGiftMessage(message, name);
  const now = new Date().toISOString();

  return (
    <Tabs defaultValue="inbox" className="space-y-3">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="inbox">En la app</TabsTrigger>
        <TabsTrigger value="email">Correo</TabsTrigger>
        <TabsTrigger value="wallet">Billetera</TabsTrigger>
      </TabsList>
      <p className="text-xs text-muted-foreground">
        {sampleLabel
          ? `Así lo ve ${sampleLabel}.`
          : "Así lo ve cada participante."}
      </p>
      <TabsContent value="inbox" className="mt-0">
        <div className="overflow-hidden rounded-lg border bg-background">
          <NotificationItem
            static
            item={{
              id: 0,
              kind: "credit_gift_received",
              category: "credits",
              title: `Recibiste ${formatCreditCount(amount)} de regalo`,
              body: personalized,
              actionPath: "/my_credits",
              actionLabel: "Ver mi billetera",
              creditDelta: amount,
              readAt: null,
              createdAt: now,
            }}
          />
        </div>
      </TabsContent>
      <TabsContent value="email" className="mt-0">
        <CreditGiftEmailPreview
          name={name}
          amount={amount}
          title={title}
          message={message}
        />
      </TabsContent>
      <TabsContent value="wallet" className="mt-0">
        <div className="flex items-start justify-between gap-4 rounded-lg border bg-background p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{CREDIT_GIFT_WALLET_LABEL}</p>
            <p className="text-xs font-medium">{title}</p>
            <p className="whitespace-pre-line text-xs text-muted-foreground">
              {personalized}
            </p>
            <p className="text-xs text-muted-foreground">
              {NOTIFICATION_SENDER_NAME}
            </p>
          </div>
          <CreditAmount
            variant="count"
            amount={amount}
            signed
            className="shrink-0 text-sm font-medium text-green-600 dark:text-green-400"
          />
        </div>
      </TabsContent>
    </Tabs>
  );
}
