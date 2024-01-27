import * as schema from '@/db/schema';
import '@/lib/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';

export const client = new Client({
  connectionString: process.env.POSTGRES_URL!,
});

async function connect() {
  await client.connect();
}

connect();
export const db = drizzle(client, { schema });
