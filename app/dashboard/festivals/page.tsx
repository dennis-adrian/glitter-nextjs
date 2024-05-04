import FestivalCard from "@/app/components/festivals/festival-card";
import { fetchFestivals } from "@/app/data/festivals/actions";

export default async function Page() {
  const festivals = await fetchFestivals();

  return (
    <div className="container p-4 md:p6">
      <h1 className="mb-2 text-2xl font-bold md:text-3xl">Festivales</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {festivals.map((festival) => (
          <FestivalCard key={festival.id} festival={festival} />
        ))}
      </div>
    </div>
  );
}
