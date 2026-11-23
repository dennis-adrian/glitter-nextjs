import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * A typed `revalidatePath(path, "page" | "layout")` names a page or layout
 * by its file path under app/, route groups included: Next tags each page
 * with the folders it sits in (`getDerivedTags` in
 * next/dist/server/lib/implicit-tags.js). "/dashboard/x" with a type matches
 * nothing once the page lives in app/(site)/dashboard/x, and nothing warns.
 * An untyped path is an address, which never has a group or a `[param]`.
 *
 * So, read from the syntax tree of every source file under app/:
 * - a typed call names, as plain strings, a folder that holds a page
 *   ("page") or pages ("layout"), and its type;
 * - an untyped call's literal parts have no "(" or "[".
 */
const ROOT = process.cwd();
const APP = path.join(ROOT, "app");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      sourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

type Call = { where: string; args: readonly ts.Expression[] };

function revalidateCalls(file: string): Call[] {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes("revalidatePath")) return [];
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const calls: Call[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "revalidatePath"
    ) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart());
      calls.push({
        where: `${path.relative(ROOT, file)}:${line + 1}`,
        args: node.arguments,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}

/** The value of a plain string, or null for anything computed. */
function plainString(node: ts.Expression | undefined): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

/** The literal parts of a path argument: all of a string, or a template's. */
function literalParts(node: ts.Expression): string[] {
  const plain = plainString(node);
  if (plain != null) return [plain];
  if (ts.isTemplateExpression(node)) {
    return [
      node.head.text,
      ...node.templateSpans.map((span) => span.literal.text),
    ];
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    return [...literalParts(node.left), ...literalParts(node.right)];
  }
  return [];
}

function hasPage(dir: string): boolean {
  if (!fs.existsSync(dir)) return false;
  if (fs.existsSync(path.join(dir, "page.tsx"))) return true;
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .some(
      (entry) => entry.isDirectory() && hasPage(path.join(dir, entry.name)),
    );
}

const calls = sourceFiles(APP).flatMap(revalidateCalls);
const typed = calls.filter((call) => call.args.length > 1);
const untyped = calls.filter((call) => call.args.length === 1);

describe("revalidatePath calls", () => {
  it("finds them", () => {
    expect(typed.length).toBeGreaterThan(100);
    expect(untyped.length).toBeGreaterThan(100);
  });

  it.each(typed)("$where names a real route with its type", ({ args }) => {
    // Plain strings: a computed path or type cannot be checked, and a
    // literal address should drop the type instead.
    const route = plainString(args[0]);
    const type = plainString(args[1]);
    expect(route, "path must be a plain string").not.toBeNull();
    expect(["page", "layout"]).toContain(type);
    const folder = path.join(APP, route!);
    if (type === "page") {
      expect(fs.existsSync(path.join(folder, "page.tsx")), folder).toBe(true);
    } else {
      expect(hasPage(folder), folder).toBe(true);
    }
  });

  it.each(untyped)(
    "$where is an address, with no group or [param]",
    ({ args }) => {
      for (const part of literalParts(args[0])) {
        expect(part).not.toMatch(/[([]/);
      }
    },
  );
});
