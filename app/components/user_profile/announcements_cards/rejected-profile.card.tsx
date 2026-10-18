import { ProfileType } from "@/app/api/users/definitions";
import BaseCard from "@/app/components/user_profile/announcements_cards/base-card";
import RequestReviewForm from "@/app/components/user_profile/request-review-form";
import { profileReviewBlocker } from "@/app/lib/users/profile-review";

export default function RejectedProfileCard({
  profile,
}: {
  /**
   * Pass it only on the participant's own pages: it adds the request button
   * and speaks to the participant. The admin dashboard renders the card
   * without it, so the copy speaks about the participant instead.
   */
  profile?: ProfileType;
}) {
  return (
    <BaseCard
      className="bg-red-100 text-red-900 border-red-300 dark:bg-red-900/40 dark:text-red-100 dark:border-red-800"
      content={
        profile
          ? "Tu perfil fue rechazado. Revisá el motivo en el correo que te enviamos, corregí tus datos y pedí una nueva revisión."
          : "Perfil rechazado. El participante puede pedir una nueva revisión desde su perfil."
      }
      footer={
        profile ? (
          <div className="w-full shrink-0 md:w-64">
            <RequestReviewForm
              profileId={profile.id}
              disabledReason={profileReviewBlocker(profile)}
            />
          </div>
        ) : undefined
      }
    />
  );
}
