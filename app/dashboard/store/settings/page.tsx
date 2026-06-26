import StoreSettingsForm from "@/app/components/organisms/store/store-settings-form";
import { fetchAllStoreSettings } from "@/app/lib/store_settings/actions";

export default async function StoreSettingsPage() {
  const settings = await fetchAllStoreSettings();

  return <StoreSettingsForm settings={settings} />;
}
