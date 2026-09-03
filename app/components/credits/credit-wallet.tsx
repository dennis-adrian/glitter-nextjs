import Link from "next/link";

import CreditBalanceSummary from "@/app/components/credits/credit-balance-summary";
import CreditLedgerList from "@/app/components/credits/credit-ledger-list";
import CreditTopUpCard from "@/app/components/credits/credit-top-up-card";
import Title from "@/app/components/atoms/heading";
import { type CreditWallet as CreditWalletData } from "@/app/lib/credits/queries";

type CreditWalletProps = {
  wallet: CreditWalletData;
  profileId: number;
};

/**
 * The wallet shows what you have and every purchase in flight; it is still not
 * where a purchase starts. Credits are always bought from the thing that needs
 * them — a reservation payment, or an optional feature like the full table —
 * so the amount is the exact shortfall for one named use and never a figure the
 * participant types. The one exception is settling a negative balance, which
 * belongs to no single use and is offered on the balance card above.
 */
export default function CreditWallet({ wallet, profileId }: CreditWalletProps) {
  const openTopUps = wallet.topUps.filter(
    (topUp) =>
      topUp.status === "awaiting_voucher" || topUp.status === "under_review",
  );
  const closedTopUps = wallet.topUps.filter(
    (topUp) => !openTopUps.includes(topUp),
  );

  return (
    <div className="space-y-6">
      <CreditBalanceSummary balances={wallet.balances} />

      {openTopUps.length > 0 && (
        <section className="space-y-3">
          <Title level={4}>Compras en curso</Title>
          {openTopUps.map((topUp) => (
            <CreditTopUpCard
              key={topUp.id}
              topUp={topUp}
              profileId={profileId}
            />
          ))}
        </section>
      )}

      <CreditLedgerList entries={wallet.entries} />

      {closedTopUps.length > 0 && (
        <section className="space-y-3">
          <Title level={4}>Compras anteriores</Title>
          {closedTopUps.map((topUp) => (
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
