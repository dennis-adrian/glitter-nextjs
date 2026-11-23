import { redirect } from "next/navigation";

import { fetchActiveFestivalBase } from "@/app/lib/festivals/actions";

/**
 * Staff's "Festival" tab: the festival in progress with its sections, or the
 * festivals list to pick an edition or create the next one when none is.
 */
export default async function StaffFestivalTab() {
  const active = await fetchActiveFestivalBase();
  redirect(active ? `/dashboard/festivals/${active.id}` : "/dashboard/festivals");
}
