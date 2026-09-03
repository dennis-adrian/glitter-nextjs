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
 * Read-only wallet. Credits are bought from the thing that needs them — a
 * reservation payment today — so there is deliberately no top-up button here.
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

      <p className="text-xs text-muted-foreground">
        Los créditos no se transfieren, no vencen y no se devuelven en efectivo.
        Si no los usás en una función, quedan disponibles en tu billetera.
      </p>
    </div>
  );
}
