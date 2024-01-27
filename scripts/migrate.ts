import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { client, db } from '@/db';

async function main() {
  await migrate(db, { migrationsFolder: './drizzle' });
  await client.end();
}

main();
