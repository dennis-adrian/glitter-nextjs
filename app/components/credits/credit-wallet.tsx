import Link from "next/link";

import CreditBalanceSummary from "@/app/components/credits/credit-balance-summary";
import CreditLedgerList from "@/app/components/credits/credit-ledger-list";
import CreditTopUpCard from "@/app/components/credits/credit-top-up-card";
import Title from "@/app/components/atoms/heading";
import {
  type FeatureHold,
  type CreditWallet as CreditWalletData,
} from "@/app/lib/credits/queries";

type CreditWalletProps = {
  wallet: CreditWalletData;
  profileId: number;
  /** Every feature earmark, open or closed. */
  holds?: FeatureHold[];
};

/**
 * The wallet shows what you have and what you have spent; it is neither where a
 * purchase starts nor where one is paid. Paying happens on the purchase's own
 * page, reached from the unfinished entry in the movements — the wallet is a
 * page people open to read, and a ten-minute countdown does not belong in the
 * middle of it. Credits are always bought from the thing that needs them — a reservation payment, or an optional feature like the full table —
 * so the amount is the exact shortfall for one named use and never a figure the
 * participant types. The one exception is settling a negative balance, which
 * belongs to no single use and is offered on the balance card above.
 */
export default function CreditWallet({
  wallet,
  profileId,
  holds = [],
}: CreditWalletProps) {
  const activeHolds = holds.filter((hold) => hold.status === "active");
  // Only a purchase still missing its voucher is unfinished business. Once the
  // voucher is in the credits are already issued, so the ledger tells that part
  // of the story and the purchase drops into the history below.
  const pendingTopUps = wallet.topUps.filter(
    (topUp) => topUp.status === "awaiting_voucher",
  );
  const pastTopUps = wallet.topUps.filter(
    (topUp) => topUp.status !== "awaiting_voucher",
  );

  return (
    <div className="space-y-6">
      <CreditBalanceSummary
        balances={wallet.balances}
        activeHolds={activeHolds}
      />

      <CreditLedgerList
        entries={wallet.entries}
        pendingTopUps={pendingTopUps}
        holds={holds}
      />

      {pastTopUps.length > 0 && (
        <section className="space-y-3">
          <Title level={4}>Compras anteriores</Title>
          {pastTopUps.map((topUp) => (
            <CreditTopUpCard
              key={topUp.id}
              topUp={topUp}
              profileId={profileId}
            />
          ))}
        </section>
      )}

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Los créditos no se transfieren, no vencen y no se devuelven en
          efectivo. Si no los usás en una función, quedan disponibles en tu
          billetera.
        </p>
        <Link
          href="/credits_info"
          className="inline-block text-sm text-primary underline underline-offset-2"
        >
          Cómo funcionan los créditos
        </Link>
      </div>
    </div>
  );
}
