import { fetchFestivals } from "@/app/data/festivals/actions";
import FestivalsTable from "@/app/components/festivals/festivals-table";

export default async function Page() {
  const festivals = await fetchFestivals();
  
  return (
    <FestivalsTable festivals={festivals} />
  );
}