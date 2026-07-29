import type { Metadata } from "next";
import { notFound } from "next/navigation";

import PurchaseTicketCard from "@/app/components/programs/purchase-ticket-card";
import SecureLinkNotice from "@/app/components/programs/secure-link-notice";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { resolvePurchaseAccess } from "@/app/lib/programs/access";
import { SESSION_PURCHASE_STATUS_LABELS } from "@/app/lib/programs/definitions";
import { buildSecureLinkUrl } from "@/app/lib/programs/notifications";
import { fetchPurchaseForAccess } from "@/app/lib/programs/purchase-queries";
import { hashAccessToken } from "@/app/lib/programs/tokens";
import { generateQrDataUrl } from "@/app/lib/utils";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

/** Never indexed: the URL carries a credential. */
export const metadata: Metadata = {
  title: "Tu inscripción",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function PurchaseAccessPage({
  params,
  searchParams,
}: Props) {
  await requireFeatureEnabled("paid_programs");

  const [{ id }, { token }] = await Promise.all([params, searchParams]);
  const purchaseId = Number(id);
  if (!Number.isInteger(purchaseId) || purchaseId <= 0) notFound();

  const [purchase, profile] = await Promise.all([
    fetchPurchaseForAccess(purchaseId),
    getCurrentUserProfile(),
  ]);

  if (!purchase) notFound();

  const access = resolvePurchaseAccess({
    purchase,
    viewerUserId: profile?.id ?? null,
    presentedTokenHash: token ? hashAccessToken(token) : null,
  });

  // A refusal renders the same 404 as a missing purchase, so probing for real
  // purchase ids tells an attacker nothing.
  if (!access.granted) notFound();

  const tickets = await Promise.all(
    purchase.lines.map(async (line) => ({
      line,
      qrDataUrl:
        line.ticket && line.ticket.status === "valid"
          ? await generateQrDataUrl(line.ticket.code)
          : null,
    })),
  );

  return (
    <div className="container mx-auto max-w-2xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Tu inscripción</h1>
        <p className="text-sm text-muted-foreground">
          {purchase.program.name} ·{" "}
          {SESSION_PURCHASE_STATUS_LABELS[purchase.status]}
        </p>
      </header>

      <div className="space-y-4">
        {tickets.map(({ line, qrDataUrl }) =>
          line.ticket ? (
            <PurchaseTicketCard
              key={line.id}
              sessionTitle={line.session.title}
              sessionType={line.session.type}
              startsAt={line.occurrence.startsAt}
              endsAt={line.occurrence.endsAt}
              venueName={line.occurrence.venue?.name ?? null}
              room={line.occurrence.room}
              ticketCode={line.ticket.code}
              ticketStatus={line.ticket.status}
              qrDataUrl={qrDataUrl}
            />
          ) : null,
        )}
      </div>

      {/* Only shown to someone who arrived by token — the owner reaches this
          from their profile and does not need a link to save. */}
      {access.via === "token" && token ? (
        <SecureLinkNotice url={buildSecureLinkUrl(purchase.id, token)} />
      ) : null}

      <p className="text-xs text-muted-foreground">
        Puedes cancelar tu inscripción hasta dos días antes de la sesión. La
        cancelación no genera reembolso.
      </p>
    </div>
  );
}
