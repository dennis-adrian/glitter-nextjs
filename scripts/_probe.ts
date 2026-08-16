import { db } from "@/db";
import { sql } from "drizzle-orm";

async function main() {
  const rows = await db.execute(sql`
    select f.id, f.name, f.status,
      (select count(distinct rp.user_id)
         from stand_reservations sr
         join participations rp on rp.reservation_id = sr.id
        where sr.festival_id = f.id and sr.status = 'accepted') as participants,
      (select count(*) from stands s
        join festival_sectors fs on fs.id = s.festival_sector_id
        where fs.festival_id = f.id) as stands
    from festivals f
    order by f.id desc
    limit 12
  `);
  console.table((rows as any).rows ?? rows);
  process.exit(0);
}
main();
