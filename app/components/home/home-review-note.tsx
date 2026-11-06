import RequestReviewForm from "@/app/components/user_profile/request-review-form";
import type { ProfileType } from "@/app/api/users/definitions";
import { profileReviewBlocker } from "@/app/lib/users/profile-review";
import { cn } from "@/app/lib/utils";

/**
 * Where the profile review stands, under the tasks it depends on. A rejected
 * profile can ask for one new review per rejection, once it is complete and
 * has its own photo; the button says why when it cannot yet.
 */
export default function HomeReviewNote({
  profile,
  hasTasks,
}: {
  profile: ProfileType;
  /** Whether the tasks above still have something for the review. */
  hasTasks: boolean;
}) {
  const rejected = profile.status === "rejected";

  return (
    <section
      className={cn(
        "flex flex-col gap-2 rounded-2xl border p-4",
        rejected
          ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
          : "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40",
      )}
    >
      <h2 className="font-display text-base font-bold text-brand-ink">
        {rejected ? "Tu perfil no fue verificado" : "Tu perfil está en revisión"}
      </h2>
      <p className="text-sm leading-relaxed text-brand-neutral">
        {rejected
          ? "Revisá el motivo en el correo que te enviamos, corregí lo señalado y pedí una nueva revisión."
          : hasTasks
            ? "El equipo lo revisa en los próximos días y te avisa por correo y con una notificación. Mientras tanto, las tareas de arriba lo dejan listo."
            : "Está completo: no hace falta nada más. El equipo lo revisa en los próximos días y te avisa por correo y con una notificación."}
      </p>
      {rejected ? (
        <RequestReviewForm
          profileId={profile.id}
          disabledReason={profileReviewBlocker(profile)}
        />
      ) : null}
    </section>
  );
}
