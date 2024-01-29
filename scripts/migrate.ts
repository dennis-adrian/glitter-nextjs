import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { pool, db } from '@/db';

async function main() {
  const client = await pool.connect();
  await migrate(db, { migrationsFolder: './drizzle' });
  client.release();
}

main();
