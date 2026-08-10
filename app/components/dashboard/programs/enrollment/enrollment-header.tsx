import { Badge, type BadgeVariant } from "@/app/components/ui/badge";
import { formatDateWithTime } from "@/app/lib/formatters";
import {
  SESSION_PURCHASE_STATUS_LABELS,
  type SessionPurchaseStatus,
} from "@/app/lib/programs/definitions";
import { formatMoney } from "@/app/lib/programs/pricing";

const STATUS_VARIANT: Record<SessionPurchaseStatus, BadgeVariant> = {
  pending_upload: "secondary",
  under_verification: "amber",
  changes_requested: "orange",
  approved: "green",
  rejected: "red",
  expired: "outline",
  cancelled: "red",
};

type Props = {
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string | null;
  isGuest: boolean;
  isActiveParticipant: boolean;
  status: SessionPurchaseStatus;
  paymentMode: "bank_qr" | "free";
  totalAmount: number;
  createdAt: Date;
  promo: {
    code: string;
    partnerName: string;
    discountPercent: number;
    discountAmount: number;
  } | null;
};

/**
 * Who this enrollment belongs to and where it stands.
 *
 * Identity comes first and stays first at every width: an admin opening this
 * page arrived from a name in a roster or an email in an inbox, and the first
 * thing they must confirm is that they are looking at the right person.
 */
export default function EnrollmentHeader({
  buyerName,
  buyerEmail,
  buyerPhone,
  isGuest,
  isActiveParticipant,
  status,
  paymentMode,
  totalAmount,
  createdAt,
  promo,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold break-words sm:text-2xl">
            {buyerName}
          </h1>
          {/* `break-all` because a long address has no break opportunity and
              would otherwise push the page into a horizontal scroll on a phone. */}
          <p className="text-sm text-muted-foreground break-all">
            {buyerEmail}
          </p>
          {buyerPhone ? (
            <p className="text-sm text-muted-foreground">{buyerPhone}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Badge variant={STATUS_VARIANT[status]}>
            {SESSION_PURCHASE_STATUS_LABELS[status]}
          </Badge>
          <Badge variant={paymentMode === "free" ? "outline" : "default"}>
            {paymentMode === "free" ? "Gratuita" : formatMoney(totalAmount)}
          </Badge>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">{isGuest ? "Invitado" : "Con cuenta"}</Badge>
        {isActiveParticipant ? (
          <Badge variant="secondary">Participante activo</Badge>
        ) : null}
        <span>Inscripción del {formatDateWithTime(createdAt)}</span>
      </div>

      {promo ? (
        <div className="flex flex-col gap-1 rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm text-purple-950 sm:flex-row sm:items-center sm:justify-between">
          <span className="break-words">
            <strong>{promo.code}</strong> · {promo.partnerName} ·{" "}
            {promo.discountPercent}%
          </span>
          <span className="font-medium">
            −{formatMoney(promo.discountAmount)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
