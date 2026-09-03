import { PackageOpenIcon } from "lucide-react";

import CreditTopUpReviewCard from "@/app/components/credits/admin/credit-top-up-review-card";
import { fetchCreditTopUpReviewQueue } from "@/app/lib/credits/queries";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

type CreditTopUpReviewQueueProps = {
  scope: "pending" | "reviewed";
  emptyLabel: string;
};

export default async function CreditTopUpReviewQueue({
  scope,
  emptyLabel,
}: CreditTopUpReviewQueueProps) {
  const [actor, queue] = await Promise.all([
    getCurrentUserProfile(),
    fetchCreditTopUpReviewQueue(scope),
  ]);
  if (!queue) return null;

  const canReview = canMutateAdminReservations(actor);
  const { items, totalCount, hasMore } = queue;

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
        <PackageOpenIcon className="h-12 w-12" />
        <span className="text-sm">{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {hasMore
          ? `Mostrando ${items.length} de ${totalCount}.`
          : `${totalCount} en total.`}
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <CreditTopUpReviewCard
            key={item.id}
            item={item}
            canReview={canReview}
          />
        ))}
      </div>
      {hasMore && (
        <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          {scope === "pending"
            ? `Hay ${totalCount - items.length} cargas más en espera. Se muestran primero las más antiguas: a medida que revisés estas, las siguientes van a aparecer acá.`
            : `Hay ${totalCount - items.length} revisiones más antiguas que no se muestran.`}
        </p>
      )}
    </div>
  );
}
