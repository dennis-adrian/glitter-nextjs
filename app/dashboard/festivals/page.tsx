import FestivalsTable from "@/app/components/organisms/festivals/festivals-table";
import { fetchFestivals } from "@/app/data/festivals/actions";

export default async function Page() {
  const festivals = await fetchFestivals();

  return (
    <div className="container p-4 md:p6">
      <h1 className="mb-2 text-2xl font-bold md:text-3xl">Festivales</h1>
      <FestivalsTable festivals={festivals} />
    </div>
  );
}
