import StoreSectionSettingsCard from "@/app/components/organisms/store/store-section-settings-card";
import type { StoreSettings } from "@/app/lib/store_settings/definitions";

type Props = {
  settings: StoreSettings[];
};

export default function StoreSettingsForm({ settings }: Props) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {settings.map((sectionSettings) => (
        <StoreSectionSettingsCard
          key={sectionSettings.section}
          settings={sectionSettings}
        />
      ))}
    </div>
  );
}
