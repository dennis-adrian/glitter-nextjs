import Link from "next/link";

import { Badge, type BadgeVariant } from "@/app/components/ui/badge";
import { formatDateWithTime } from "@/app/lib/formatters";
import {
  SESSION_PURCHASE_STATUS_LABELS,
  type SessionPurchaseStatus,
} from "@/app/lib/programs/definitions";
import {
  ENROLLMENT_SEARCH_MIN_LENGTH,
  type EnrollmentSearchResult,
} from "@/app/lib/programs/purchase-queries";
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
  results: EnrollmentSearchResult[];
  /** Trimmed; shorter than the minimum means nothing was searched. */
  query: string;
};

/**
 * Search hits, each a link into the enrollment it found.
 *
 * Every row shows its status, because "I paid" and "we never received it" is
 * the most common thing this page is opened to settle.
 */
export default function EnrollmentSearchResults({ results, query }: Props) {
  /**
   * Covers both the untouched field and a query too short to run. The page
   * never queries below this length, so reporting "no encontramos" for one
   * character would be asserting an absence nobody looked for.
   */
  if (query.length < ENROLLMENT_SEARCH_MIN_LENGTH) {
    return (
      <p className="text-sm text-muted-foreground">
        Busca por nombre, correo, código de entrada o número de inscripción.
        Escribe al menos {ENROLLMENT_SEARCH_MIN_LENGTH} caracteres.
      </p>
    );
  }

  if (results.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No encontramos inscripciones para “{query}”.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {results.map((result) => (
        <li key={result.purchaseId}>
          <Link
            href={`/dashboard/programs/purchases/${result.purchaseId}`}
            className="block rounded-lg border p-3 transition-colors hover:bg-muted/50"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium break-words">{result.attendeeName}</p>
                <p className="text-sm text-muted-foreground break-all">
                  {result.attendeeEmail}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <Badge variant={STATUS_VARIANT[result.status]}>
                  {SESSION_PURCHASE_STATUS_LABELS[result.status]}
                </Badge>
                <Badge
                  variant={
                    result.paymentMode === "free" ? "outline" : "default"
                  }
                >
                  {result.paymentMode === "free"
                    ? "Gratuita"
                    : formatMoney(result.totalAmount)}
                </Badge>
              </div>
            </div>

            <ul className="mt-2 space-y-0.5">
              {result.sessions.map((session, index) => (
                <li
                  key={`${result.purchaseId}-${index}`}
                  className="text-xs text-muted-foreground break-words"
                >
                  {session.title} · {formatDateWithTime(session.startsAt)}
                </li>
              ))}
            </ul>

            <p className="mt-2 text-xs text-muted-foreground">
              #{result.purchaseId} ·{" "}
              {result.isGuest ? "Invitado" : "Con cuenta"} ·{" "}
              {formatDateWithTime(result.createdAt)}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
