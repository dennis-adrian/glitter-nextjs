import CulturalActivityWizardLoading from "@/app/components/cultural-activities/cultural-activity-wizard-loading";

/**
 * The form's instant state on navigation from /actividades-culturales.
 * `data-bare-page` hides the site navigation at once, as the page does.
 */
export default function Loading() {
  return (
    <div data-bare-page="">
      <CulturalActivityWizardLoading />
    </div>
  );
}
