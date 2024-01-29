import * as schema from '@/db/schema';
import '@/app/lib/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.POSTGRES_URL!,
});

export const db = drizzle(pool, { schema });
