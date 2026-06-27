import * as schema from "@/db/schema";
import type { Logger } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import "@/app/lib/config";

function redactQueryParams(query: string, params: unknown[]): unknown[] {
  if (!/external_participants/i.test(query)) {
    return params;
  }

  return params.map((param) => {
    if (typeof param !== "string") {
      return param;
    }
    if (param.includes("@")) {
      return "[REDACTED_EMAIL]";
    }
    if (/^\+?[\d\s().-]{8,}$/.test(param)) {
      return "[REDACTED_PHONE]";
    }
    return param;
  });
}

const redactingLogger: Logger = {
  logQuery(query: string, params: unknown[]) {
    console.log({ query, params: redactQueryParams(query, params) });
  },
};

export const pool = new Pool({
  connectionString: process.env.POSTGRES_URL!,
});

export const db = drizzle(pool, { schema, logger: redactingLogger });
