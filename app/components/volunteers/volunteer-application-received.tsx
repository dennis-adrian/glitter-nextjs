import { VOLUNTEER_COPY } from "@/app/lib/volunteers/definitions";

/**
 * Placeholder thank-you state. It must not say the applicant is accepted or
 * confirmed: a duplicate email and a honeypot land here too.
 */
export default function VolunteerApplicationReceived() {
  return (
    <section
      className="grid gap-2 rounded-lg border p-6 text-center"
      role="status"
      aria-live="polite"
    >
      <h2 className="text-2xl font-semibold">{VOLUNTEER_COPY.thankYouTitle}</h2>
      <p className="break-words">{VOLUNTEER_COPY.thankYouMessage}</p>
    </section>
  );
}
