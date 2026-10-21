import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Participants and visitors are written to in voseo (tenés, podés, completá,
 * and in the negative no compartás, no te preocupés), and each email keeps
 * one grammatical person throughout. Tuteo slips in one line at a time and
 * ends up mixed with the voseo around it: the payment reminder once opened
 * "Recuerda hacer el pago" above "Si tenés alguna duda".
 *
 * This is a backstop, not a proof. Lower-case imperatives mid-sentence
 * (ahorra, abre, crea) read the same as third person, so they are left to
 * review. Subjects built elsewhere in app/lib/** are not scanned: the
 * send-site tests pin them. The inbox copies in app/lib/notifications/kinds/
 * are, since they say what these emails say.
 *
 * Add a template below only when it is sent to the admin list alone.
 */
const ADMIN_ONLY_REASON =
  "sent only to the admin list; the voseo rule covers participant and visitor copy";
const ADMIN_ONLY: Record<string, string> = {
  "festival-activity-registration.tsx": ADMIN_ONLY_REASON,
  "order-confirmation-for-admins.tsx": ADMIN_ONLY_REASON,
  "order-updated-for-admins.tsx": ADMIN_ONLY_REASON,
  "order-voucher-submitted-for-admins.tsx": ADMIN_ONLY_REASON,
  "payment-confirmation-for-admins.tsx": ADMIN_ONLY_REASON,
  "profile-completion.tsx": ADMIN_ONLY_REASON,
  "program-signup-for-admins.tsx": ADMIN_ONLY_REASON,
  "reservation-confirmation-for-admins.tsx": ADMIN_ONLY_REASON,
  "reservation-created.tsx": ADMIN_ONLY_REASON,
  "terms-acceptance.tsx": ADMIN_ONLY_REASON,
};

const EMAILS_DIR = path.join(process.cwd(), "app/emails");

// `\b` stops at accented letters in JS, so the edges are Unicode lookarounds.
const TUTEO =
  /(?<!\p{L})(tienes|puedes|quieres|debes|necesitas|deseas|pierdes|haz|a ti|copia y pega|comunícate|contáctanos|escríbenos|inscríbete|súbelo|alístate|mándanos|asegúrate)(?!\p{L})/giu;
// Case-sensitive: capitalised, these open a sentence and can only be a command.
const TUTEO_IMPERATIVE =
  /(?<!\p{L})(Recuerda|Completa|Muestra|Guarda|Sube|Abre|Usa|Evita|Ingresa|Revisa|Elige|Accede|Visita|Crea|Descarga|Presenta|Confirma|Selecciona|Envía|Paga|Agrega|Actualiza|Alístate)(?!\p{L})/gu;
// Negative commands take the voseo subjunctive (no compartás, no te
// preocupés). "que no …" is left out: a subordinate clause keeps the
// standard form, like the "que completes" the rule already allows.
const TUTEO_NEGATIVE =
  /(?<!(?<!\p{L})que\s+)(?<!\p{L})no\s+(?:(?:te|lo|la|los|las|le|les|nos|me)\s+)*(?:compartas|preocupes|olvides|dudes|dejes|pierdas|esperes|respondas|reenvíes|uses|borres|confundas|cierres|intentes)(?!\p{L})/giu;

const INBOX_KINDS_DIR = path.join(process.cwd(), "app/lib/notifications/kinds");

function tuteoIn(file: string, source: string): string[] {
  return [
    ...[...source.matchAll(TUTEO)].map((match) => `${file}: ${match[0]}`),
    ...[...source.matchAll(TUTEO_IMPERATIVE)].map(
      (match) => `${file}: ${match[0]}`,
    ),
    ...[...source.matchAll(TUTEO_NEGATIVE)].map(
      (match) => `${file}: ${match[0].replace(/\s+/g, " ")}`,
    ),
  ];
}

function templateFiles(dir = EMAILS_DIR, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      return templateFiles(path.join(dir, entry.name), relative);
    }
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)
      ? [relative]
      : [];
  });
}

describe("email templates", () => {
  it("keeps participant and visitor emails in voseo", () => {
    const offenders: string[] = [];

    for (const file of templateFiles()) {
      if (ADMIN_ONLY[file]) continue;
      const source = readFileSync(path.join(EMAILS_DIR, file), "utf8");
      offenders.push(...tuteoIn(file, source));
    }

    expect(offenders).toEqual([]);
  });

  it("keeps the inbox copies of these emails in voseo", () => {
    const files = readdirSync(INBOX_KINDS_DIR).filter(
      (file) => /\.ts$/.test(file) && !/\.test\.ts$/.test(file),
    );
    expect(files).toContain("reservation-outbox.ts");
    const offenders = files.flatMap((file) =>
      tuteoIn(file, readFileSync(path.join(INBOX_KINDS_DIR, file), "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("tells a tuteo negative command from voseo and from a subordinate clause", () => {
    const hits = (text: string) => [...text.matchAll(TUTEO_NEGATIVE)].length;
    expect(hits("No lo compartas")).toBe(1);
    expect(hits("no te\n    preocupes")).toBe(1);
    expect(hits("No lo compartás")).toBe(0);
    expect(hits("no te preocupés")).toBe(0);
    expect(hits("te pedimos que no lo compartas")).toBe(0);
  });

  it("finds the files it is meant to scan", () => {
    // Guards the guard: a moved directory would otherwise pass vacuously.
    const files = templateFiles();
    expect(files).toContain("ticket.tsx");
    expect(files).toContain("verification_confimation/email-template.tsx");
    // A renamed or deleted admin template must not leave a stale exemption.
    for (const file of Object.keys(ADMIN_ONLY)) {
      expect(existsSync(path.join(EMAILS_DIR, file)), file).toBe(true);
    }
  });
});
