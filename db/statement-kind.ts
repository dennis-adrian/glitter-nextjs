/**
 * Whether a SQL statement can change data. Used by the read-only guard of
 * "Entrar como participante" (docs/PLAN-impersonation.md §6.1), which refuses
 * writes while an admin views the app as a participant and lets reads through.
 *
 * Pure and dependency-free: `db/index.ts` loads it in scripts too.
 *
 * Errs towards "write": a statement it cannot place is refused during a view
 * rather than run as the participant. The read keywords are the ones Drizzle
 * and this codebase send (`select`, `with … select`, `values`, `show`,
 * `explain` without `analyze`) plus transaction control, which only frames
 * the statements inside it.
 */

export type StatementKind = "read" | "write";

const READ_KEYWORDS = new Set(["select", "values", "table", "show"]);

/**
 * Transaction framing and session settings. They change nothing a later read
 * could see; whatever runs inside the transaction is checked on its own.
 */
const CONTROL_KEYWORDS = new Set([
  "begin",
  "start",
  "commit",
  "end",
  "rollback",
  "abort",
  "savepoint",
  "release",
  "set",
  "reset",
  "discard",
  "lock",
]);

const DATA_MODIFYING = /\b(insert|update|delete|merge|truncate)\b/;
/**
 * Row locks are reads: `for update` and `for no key update` lock what a
 * select returns and change nothing. The write that would follow is a
 * statement of its own.
 */
const ROW_LOCK = /\bfor\s+(no\s+key\s+)?update\b/g;
/**
 * `select … into new_table` creates a table. Only matched where a select
 * list ends, not `insert into`, which is a write anyway.
 */
const SELECT_INTO = /\bselect\b[\s\S]*?\binto\b(?!\s*\()/;

/**
 * Comments, string literals (standard, E'' escapes, dollar-quoted) and quoted
 * identifiers removed, so a column called "update" or the text 'delete' in a
 * literal never reads as a keyword. Lower-cased.
 */
export function stripSqlNoise(text: string): string {
  let out = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i]!;
    const next = text[i + 1];
    if (ch === "-" && next === "-") {
      // Postgres ends a line comment at a newline or a carriage return.
      const rest = text.slice(i + 2).search(/[\n\r]/);
      i = rest === -1 ? n : i + 2 + rest + 1;
      out += " ";
      continue;
    }
    if (ch === "/" && next === "*") {
      // Postgres block comments nest.
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (text[i] === "/" && text[i + 1] === "*") {
          depth += 1;
          i += 2;
        } else if (text[i] === "*" && text[i + 1] === "/") {
          depth -= 1;
          i += 2;
        } else {
          i += 1;
        }
      }
      out += " ";
      continue;
    }
    if (ch === "'") {
      const escapes = /[eE]$/.test(out) && !/[\w$]$/.test(out.slice(0, -1));
      i += 1;
      while (i < n) {
        if (escapes && text[i] === "\\") {
          i += 2;
          continue;
        }
        if (text[i] === "'") {
          if (text[i + 1] === "'") {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      out += " '' ";
      continue;
    }
    if (ch === '"') {
      i += 1;
      while (i < n) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      out += ' "" ';
      continue;
    }
    if (ch === "$") {
      // Tags may hold any letter Postgres takes in an identifier.
      const tag = /^\$([\p{L}_][\p{L}\p{N}_]*)?\$/u.exec(text.slice(i));
      if (tag && !/[\w$]$/.test(out)) {
        const close = text.indexOf(tag[0], i + tag[0].length);
        i = close === -1 ? n : close + tag[0].length;
        out += " '' ";
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return out.toLowerCase();
}

function classifyOne(statement: string): StatementKind | null {
  const body = statement.replace(/^[\s(]+/, "");
  if (body.length === 0) return null;
  const keyword = /^[a-z_]+/.exec(body)?.[0] ?? "";

  if (CONTROL_KEYWORDS.has(keyword)) {
    // `set transaction read write` and friends still change nothing.
    return "read";
  }
  if (keyword === "explain") {
    // `explain analyze` runs the statement it explains.
    return /^explain\s*(\([^)]*\banalyze\b|\s+analy[sz]e\b)/.test(body)
      ? "write"
      : classifyOne(
          body.replace(/^explain\s*(\([^)]*\)\s*|\s+(verbose\s+)?)/, ""),
        );
  }
  if (keyword === "with") {
    // A data-modifying CTE makes the whole statement a write.
    const withoutLocks = body.replace(ROW_LOCK, " ");
    if (DATA_MODIFYING.test(withoutLocks)) return "write";
    // `with … select … into new_table` creates a table too.
    return SELECT_INTO.test(withoutLocks) ? "write" : "read";
  }
  if (READ_KEYWORDS.has(keyword)) {
    if (keyword === "select" && SELECT_INTO.test(body.replace(ROW_LOCK, " "))) {
      return "write";
    }
    return "read";
  }
  return "write";
}

/**
 * "write" when any statement in `text` can change data. Several statements
 * separated by `;` are each classified; one write makes it a write.
 */
export function classifyStatement(text: string): StatementKind {
  const cleaned = stripSqlNoise(text);
  let sawStatement = false;
  for (const statement of cleaned.split(";")) {
    const kind = classifyOne(statement);
    if (kind === "write") return "write";
    if (kind === "read") sawStatement = true;
  }
  // Nothing but whitespace and comments: there is nothing to run.
  return sawStatement || cleaned.trim() === "" ? "read" : "write";
}
