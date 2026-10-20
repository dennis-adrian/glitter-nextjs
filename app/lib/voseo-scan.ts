import { readdirSync } from "node:fs";
import path from "node:path";

/**
 * Participants and visitors are written to in voseo (tenés, podés, completá,
 * and in the negative no compartás, no te preocupés), one grammatical person
 * per email or screen. Tuteo slips in one line at a time and ends up mixed
 * with the voseo around it: the payment reminder once opened "Recuerda hacer
 * el pago" above "Si tenés alguna duda".
 *
 * The voseo tests for emails and for screens share these patterns. They are a
 * backstop, not a proof: lower-case imperatives mid-sentence (ahorra, abre,
 * intenta) read the same as third person, so they are left to review.
 */

// `\b` stops at accented letters in JS, so the edges are Unicode lookarounds.
const TUTEO =
  /(?<!\p{L})(tienes|puedes|quieres|debes|necesitas|deseas|pierdes|eres|vienes|buscas|sabes|prefieres|te llamas|te identificas|tú|contigo|a ti|para ti|sobre ti|haz|copia y pega|comunícate|contáctanos|escríbenos|inscríbete|súbelo|alístate|mándanos|asegúrate)(?!\p{L})/giu;
// Case-sensitive: capitalised, these open a sentence and can only be a command.
const TUTEO_IMPERATIVE =
  /(?<!\p{L})(Recuerda|Completa|Muestra|Guarda|Sube|Abre|Usa|Evita|Ingresa|Revisa|Elige|Accede|Visita|Crea|Descarga|Presenta|Confirma|Selecciona|Envía|Paga|Agrega|Actualiza|Alístate|Pide|Espera|Intenta|Adquiere|Busca|Escribe|Vuelve|Toca|Obtén)(?!\p{L})/gu;
// Negative commands take the voseo subjunctive (no compartás, no te
// preocupés). "que no …" is left out: a subordinate clause keeps the
// standard form, like the "que completes" the rule already allows.
const TUTEO_NEGATIVE =
  /(?<!(?<!\p{L})que\s+)(?<!\p{L})no\s+(?:(?:te|lo|la|los|las|le|les|nos|me)\s+)*(?:compartas|preocupes|olvides|dudes|dejes|pierdas|esperes|respondas|reenvíes|uses|borres|confundas|cierres|intentes)(?!\p{L})/giu;

/** Every tuteo form in `source`, as written, with line breaks collapsed. */
export function tuteoHits(source: string): string[] {
  return [TUTEO, TUTEO_IMPERATIVE, TUTEO_NEGATIVE].flatMap((pattern) =>
    [...source.matchAll(pattern)].map((match) => match[0].replace(/\s+/g, " ")),
  );
}

/**
 * Source files under `dir`, as paths relative to it, without tests or
 * stories: those quote copy rather than show it.
 */
export function sourceFiles(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      return sourceFiles(path.join(dir, entry.name), relative);
    }
    return /\.tsx?$/.test(entry.name) &&
      !/\.(test|stories)\.tsx?$/.test(entry.name)
      ? [relative]
      : [];
  });
}
