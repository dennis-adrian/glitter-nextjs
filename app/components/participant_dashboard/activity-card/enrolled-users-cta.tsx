import Link from "next/link";

import { ChevronRightIcon, VoteIcon } from "lucide-react";

import { BaseProfile } from "@/app/api/users/definitions";
import CouponBookProofModal from "@/app/components/festivals/festival_activities/coupon-book-proof-modal";
import UploadStickerDesignModal from "@/app/components/festivals/festival_activities/upload-sticker-design-modal";
import {
  ActivityTheme,
  EnrolledConfig,
} from "@/app/components/participant_dashboard/activity-card/types";
import { Button } from "@/app/components/ui/button";
import type {
  ProofDisplayState,
  ProofType,
} from "@/app/lib/festival_activites/types";
import {
  FestivalActivityWithDetailsAndParticipants,
  FestivalBase,
} from "@/app/lib/festivals/definitions";

type EnrolledUsersCtaProps = {
  enrolledConfig: EnrolledConfig;
  participationId: number;
  festivalId: FestivalBase["id"];
  activityId: FestivalActivityWithDetailsAndParticipants["id"];
  forProfile: BaseProfile;
  theme: ActivityTheme;
  proofType?: ProofType | null;
  proofDisplayState: ProofDisplayState;
  adminFeedback?: string | null;
  existingPromoHighlight?: string | null;
  existingPromoDescription?: string | null;
  existingPromoConditions?: string | null;
};

export default function EnrolledUsersCta({
  enrolledConfig,
  participationId,
  festivalId,
  activityId,
  forProfile,
  theme,
  proofType,
  proofDisplayState,
  adminFeedback,
  existingPromoHighlight,
  existingPromoDescription,
  existingPromoConditions,
}: EnrolledUsersCtaProps) {
  const uploadTriggerClassName = `w-full md:max-w-full rounded-full border-0 text-primary-foreground ${enrolledConfig.isDestructive ? "bg-red-600 hover:bg-red-700" : "bg-primary hover:bg-primary/90"}`;

  return (
    <div className="pt-2 flex flex-col gap-3">
      {enrolledConfig.isPending &&
        (enrolledConfig.ctaType === "upload" ? (
          enrolledConfig.isUploadExpired ? null : proofType === "both" ? (
            <div className="flex flex-col gap-2">
              <CouponBookProofModal
                participationId={participationId}
                proofDisplayState={proofDisplayState}
                adminFeedback={adminFeedback}
                existingPromoHighlight={existingPromoHighlight}
                existingPromoDescription={existingPromoDescription}
                existingPromoConditions={existingPromoConditions}
                triggerLabel={
                  proofDisplayState === "rejected_resubmit"
                    ? "Editar y reenviar"
                    : "Cargar promoción"
                }
                triggerClassName={uploadTriggerClassName}
              />
              <UploadStickerDesignModal
                participationId={participationId}
                forProfileId={forProfile.id}
                maxFiles={1}
                triggerLabel={
                  proofDisplayState === "rejected_resubmit"
                    ? "Reenviar diseño"
                    : "Subir diseño"
                }
                triggerClassName={uploadTriggerClassName}
              />
            </div>
          ) : proofType === "text" ? (
            <CouponBookProofModal
              participationId={participationId}
              proofDisplayState={proofDisplayState}
              adminFeedback={adminFeedback}
              existingPromoHighlight={existingPromoHighlight}
              existingPromoDescription={existingPromoDescription}
              existingPromoConditions={existingPromoConditions}
              triggerLabel={enrolledConfig.ctaLabel}
              triggerClassName={uploadTriggerClassName}
            />
          ) : (
            <UploadStickerDesignModal
              participationId={participationId}
              forProfileId={forProfile.id}
              maxFiles={1}
              triggerLabel={enrolledConfig.ctaLabel}
              triggerClassName={uploadTriggerClassName}
            />
          )
        ) : (
          <Button className="w-full" size="sm" asChild>
            <Link
              href={`/profiles/${forProfile.id}/festivals/${festivalId}/activity/${activityId}/voting`}
            >
              <VoteIcon className="w-4 h-4 mr-1" />
              {enrolledConfig.ctaLabel}
            </Link>
          </Button>
        ))}
      <Link
        href={`/profiles/${forProfile.id}/festivals/${festivalId}/activity/${activityId}`}
        className="flex items-center justify-center gap-1 text-sm font-semibold transition-opacity hover:opacity-80"
        style={{ color: theme.accentText }}
      >
        Ver detalles
        <ChevronRightIcon className="w-4 h-4" />
      </Link>
    </div>
  );
}
