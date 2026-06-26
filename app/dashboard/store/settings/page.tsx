import { redirect } from "next/navigation";

import StoreSettingsForm from "@/app/components/organisms/store/store-settings-form";
import { fetchAllStoreSettings } from "@/app/lib/store_settings/actions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function StoreSettingsPage() {
  const profile = await getCurrentUserProfile();
  if (profile?.role !== "admin") {
    redirect("/dashboard/store");
  }

  const settings = await fetchAllStoreSettings();

  return <StoreSettingsForm settings={settings} />;
}
