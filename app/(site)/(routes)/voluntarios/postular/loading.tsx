import VolunteerApplicationLoading from "@/app/components/volunteers/volunteer-application-loading";

/**
 * The form's instant state on navigation from /voluntarios. `data-bare-page`
 * hides the site navigation at once, as the page itself does.
 */
export default function Loading() {
  return (
    <div data-bare-page="">
      <VolunteerApplicationLoading />
    </div>
  );
}
