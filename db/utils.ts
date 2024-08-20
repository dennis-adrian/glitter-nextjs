import { sql, SQL, StringChunk } from "drizzle-orm";

// TODO: Make it possible to pass the operator (and, or, etc.) as a parameter
export const buildWhereClause = (whereCondition: SQL, queryChunk: SQL) => {
  if (whereCondition.queryChunks.length === 0) {
    whereCondition.append(queryChunk);
  } else {
    whereCondition.append(sql` and `);
    whereCondition.append(queryChunk);
  }
};
