import FestivalsTable from "@/app/components/organisms/festivals/festivals-table";
import { fetchFestivals } from "@/app/data/festivals/actions";
import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { PlusIcon } from "lucide-react";

export default async function Page() {
  const festivals = await fetchFestivals();

  return (
    <div className="container p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold md:text-3xl">Festivales</h1>
        <Link href="/dashboard/festivals/add">
          <Button>
            <PlusIcon className="mr-2 h-4 w-4" />
            Agregar Festival
          </Button>
        </Link>
      </div>
      <FestivalsTable festivals={festivals} />
    </div>
  );
}