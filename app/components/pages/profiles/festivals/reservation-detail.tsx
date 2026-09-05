import Link from "next/link";
import { notFound } from "next/navigation";

import Title from "@/app/components/atoms/heading";
import ReservationAvailableActions from "@/app/components/festivals/reservations/reservation-available-actions";
import AddLatePartnerButton from "@/app/components/festivals/reservations/add-late-partner-button";
import ReleaseReservationButton from "@/app/components/festivals/reservations/release-reservation-button";
import ReservationStatusPanel from "@/app/components/festivals/reservations/reservation-status-panel";
import ReservationSummary from "@/app/components/festivals/reservations/reservation-summary";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { formatDate } from "@/app/lib/formatters";
import { summarizeReservationStands } from "@/app/lib/reservations/member-stands";
import { participantStatusCopy } from "@/app/lib/reservations/participant-status";
import { fetchReservationForParticipant } from "@/app/lib/reservations/queries";
import { fetchLatePartnerOffer } from "@/app/lib/reservations/late-partner-queries";
import { fetchReleaseOffer } from "@/app/lib/reservations/release-queries";
import { isFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";
import { getUserName } from "@/app/lib/users/utils";

type ReservationDetailPageProps = {
  profileId: number;
  festivalId: number;
  reservationId: number;
};

/**
 * A participant's view of one reservation (PRD §12).
 *
 * The page exists to answer three questions without making anyone email
 * anybody: what did I book, where does it stand, and what can I do about it.
 * The third is why both remaining phases need this page — `Agregar compañero`
 * and `Liberar reserva` have nowhere else to live.
 *
 * Money stays deliberately thin here. The payments page is where an invoice is
 * settled, and duplicating its totals would give a participant two screens
 * that could disagree.
 */
export default async function ReservationDetailPage({
  profileId,
  festivalId,
  reservationId,
}: ReservationDetailPageProps) {
  const currentProfile = await getCurrentUserProfile();
  await protectRoute(currentProfile || undefined, profileId);

  const reservation = await fetchReservationForParticipant(reservationId);
  // Not-found rather than forbidden, and the same for a reservation that
  // exists but belongs to somebody else: telling a stranger which reservation
  // ids are real is a leak with nothing to gain.
  if (!reservation || reservation.festivalId !== festivalId) notFound();

  const copy = participantStatusCopy(reservation.status);
  if (!copy) notFound();

  const stands = summarizeReservationStands(
    reservation.members.map((member) => ({
      id: member.standId,
      label: member.stand.label,
      standNumber: member.stand.standNumber,
      standCategory: member.stand.standCategory,
      releasedAt: member.releasedAt,
      position: member.position,
    })),
  );

  const isOwner = reservation.ownerUserId === currentProfile?.id;

  // Release is paid for in credits and finished in the wallet, so with credits
  // still behind their flag there is no route from the button to a released
  // reservation. The offer goes rather than quoting a price nobody can pay.
  const [creditsEnabled, releaseOffer, latePartnerOffer] = await Promise.all([
    isFeatureEnabled("credits"),
    fetchReleaseOffer({
      userId: currentProfile?.id ?? 0,
      festivalId,
      reservationStatus: reservation.status,
      isOwner,
    }),
    isOwner
      ? fetchLatePartnerOffer({
          reservationId,
          userId: currentProfile?.id ?? 0,
        })
      : null,
  ]);

  // Always shown while the feature is on, because a deadline nobody mentions
  // is a deadline somebody misses (§5). Gated on the flag for the same reason
  // the buttons below are: with credits hidden there is no way to act on this
  // date, and naming it would promise a door that is not there.
  const partnerDeadline =
    creditsEnabled && latePartnerOffer?.offered && latePartnerOffer.deadlineAt
      ? formatDate(latePartnerOffer.deadlineAt).toFormat("dd/MM/yyyy")
      : null;

  const invoice =
    reservation.invoices.find((row) => row.status !== "cancelled") ??
    reservation.invoices[0];
  const owesPayment =
    invoice != null &&
    (invoice.status === "pending" || invoice.status === "verification_payment");

  return (
    <div className="container max-w-[640px] p-4 md:p-6">
      <div className="mb-4 flex flex-col gap-1">
        <Title>Tu reserva</Title>
        <p className="text-sm text-muted-foreground">
          {reservation.festival.name}
        </p>
      </div>

      <Card>
        <CardContent className="space-y-6 pt-6">
          <ReservationStatusPanel
            copy={copy}
            deadlineLabel={
              invoice?.dueAt && owesPayment
                ? formatDate(invoice.dueAt).toFormat("dd/MM/yyyy HH:mm")
                : null
            }
          />

          <ReservationSummary
            isFullTable={stands.isFullTable}
            standLabel={stands.label}
            dimensions={stands.dimensions}
            sectorName={reservation.stand.festivalSector?.name ?? null}
            rows={[
              {
                label:
                  reservation.participants.length > 1
                    ? "Participantes"
                    : "A nombre de",
                value: reservation.participants
                  .map((participant) => getUserName(participant.user))
                  .join(" y "),
              },
              ...(invoice
                ? [
                    {
                      label: "Precio",
                      value: `Bs${invoice.amount}`,
                      emphasis: true,
                    },
                  ]
                : []),
            ]}
          />

          {/* A partner sees the reservation and its price but never the
              payment: the owner pays (PRD §14). */}
          {owesPayment && isOwner && (
            <Button asChild className="w-full sm:w-auto">
              <Link
                href={`/profiles/${profileId}/festivals/${festivalId}/reservations/${reservationId}/payments`}
              >
                {invoice.status === "verification_payment"
                  ? "Ver estado del pago"
                  : "Completar el pago"}
              </Link>
            </Button>
          )}
          {owesPayment && !isOwner && (
            <p className="text-sm text-muted-foreground">
              El pago corre por cuenta de{" "}
              {getUserName(
                reservation.participants.find(
                  (participant) =>
                    participant.userId === reservation.ownerUserId,
                )?.user ?? reservation.participants[0].user,
              )}
              .
            </p>
          )}

          {/* Shown to both, actionable only for the owner. A partner who saw
              nothing here would be left wondering whether the section was
              broken or whether they had missed a deadline. */}
          <ReservationAvailableActions
            canAct={isOwner}
            deadlineNote={
              partnerDeadline
                ? `Si olvidaste agregar a tu compañero, podés hacerlo hasta el ${partnerDeadline} usando créditos.`
                : undefined
            }
          >
            {creditsEnabled &&
            (releaseOffer.offered || latePartnerOffer?.offered) ? (
              <>
                {latePartnerOffer?.offered && (
                  <AddLatePartnerButton
                    reservationId={reservationId}
                    festivalId={festivalId}
                    sharedPriceDifference={
                      latePartnerOffer.sharedPriceDifference
                    }
                    featurePrice={latePartnerOffer.featurePrice}
                    totalCredits={latePartnerOffer.totalCredits}
                    shortfall={latePartnerOffer.shortfall}
                    deadlineLabel={partnerDeadline}
                  />
                )}
                {releaseOffer.offered && (
                  <ReleaseReservationButton
                    reservationId={reservationId}
                    festivalId={festivalId}
                    creditPrice={releaseOffer.creditPrice}
                    shortfall={releaseOffer.shortfall}
                    standLabel={stands.label}
                  />
                )}
              </>
            ) : undefined}
          </ReservationAvailableActions>
        </CardContent>
      </Card>
    </div>
  );
}
