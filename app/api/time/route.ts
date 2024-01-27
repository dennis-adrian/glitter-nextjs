import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export async function GET() {
  const result = (await db.execute(sql`SELECT NOW()`)).rows;
  return NextResponse.json({ result });
}
