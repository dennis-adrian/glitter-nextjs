import { fetchFestivalSectors, fetchConfirmedProfilesByFestivalId } from "@/app/lib/festival_sectors/actions";
import { fetchFestivalActivitiesByFestivalId } from "@/app/lib/festivals/actions";
import { stripHiddenReservationsFromSectors } from "@/app/lib/reservations/reveal";

const kb = (v: unknown) => (Buffer.byteLength(JSON.stringify(v)) / 1024).toFixed(1) + " KB";

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t = performance.now();
  const r = await fn();
  console.error(`TIME ${label}: ${(performance.now() - t).toFixed(0)}ms`);
  return r;
}

async function main() {
  const id = Number(process.argv[2] ?? 484);
  const t0 = performance.now();
  const [rawSectors, activities, participants] = await Promise.all([
    timed("sectors", () => fetchFestivalSectors(id)),
    timed("activities", () => fetchFestivalActivitiesByFestivalId(id)),
    timed("profiles", () => fetchConfirmedProfilesByFestivalId(id)),
  ]);
  console.error(`TIME total parallel: ${(performance.now() - t0).toFixed(0)}ms`);

  const sectors = stripHiddenReservationsFromSectors(rawSectors);
  const stands = sectors.flatMap((s) => s.stands);
  console.error("---- SIZES ----");
  console.error("sectors (raw JSON):", kb(rawSectors));
  console.error("  sectors count:", sectors.length, "stands:", stands.length);
  console.error("  mapElements:", kb(sectors.map((s) => (s as any).mapElements)));
  console.error("  one stand sample:", kb(stands[0]));
  console.error("activities (raw JSON):", kb(activities));
  console.error("profiles (raw JSON):", kb(participants), "count:", participants.length);
  console.error("  one profile sample keys:", Object.keys(participants[0] ?? {}).join(","));
  console.error("  profiles[0].participations:", (participants[0] as any)?.participations?.length);
  console.error("  profiles[0] JSON:", kb(participants[0]));
  const userCols = Object.keys((participants[0] ?? {}) as object).filter(
    (k) => k !== "stands" && k !== "participations",
  );
  console.error("  user columns:", userCols.join(", "));
  process.exit(0);
}
main();
