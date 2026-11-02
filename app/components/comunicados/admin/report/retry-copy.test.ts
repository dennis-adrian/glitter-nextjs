import { describe, expect, it } from "vitest";

import {
  retryButtonLabel,
  retryDialogText,
} from "@/app/components/comunicados/admin/report/retry-copy";
import type { ComunicadoRetryCounts } from "@/app/lib/comunicados/contracts";

function counts(
  overrides: Partial<ComunicadoRetryCounts> = {},
): ComunicadoRetryCounts {
  return { emails: 6, people: 2, maybeSentEmails: 3, ...overrides };
}

describe("retryButtonLabel", () => {
  it("counts the emails and the people it would retry", () => {
    expect(retryButtonLabel(counts())).toBe("Reintentar fallidos (8)");
    expect(retryButtonLabel(counts({ emails: 0 }))).toBe(
      "Reintentar fallidos (2)",
    );
    expect(retryButtonLabel(counts({ people: 0 }))).toBe(
      "Reintentar fallidos (6)",
    );
    expect(retryButtonLabel(counts({ emails: 1_180, people: 60 }))).toBe(
      "Reintentar fallidos (1.240)",
    );
  });

  it("offers nothing when nothing can be retried, whatever may have arrived", () => {
    expect(retryButtonLabel(counts({ emails: 0, people: 0 }))).toBeNull();
    expect(
      retryButtonLabel({ emails: 0, people: 0, maybeSentEmails: 0 }),
    ).toBeNull();
  });
});

describe("retryDialogText", () => {
  it("says it as G6 does", () => {
    expect(retryDialogText(counts())).toBe(
      "Reintentamos 6 correos y 2 personas que no llegaron a recibirlo, con el texto actual. No reintentamos los 3 correos que pueden haber llegado.",
    );
  });

  it("speaks of one email, one person and one that may have arrived in the singular", () => {
    expect(retryDialogText({ emails: 1, people: 1, maybeSentEmails: 1 })).toBe(
      "Reintentamos 1 correo y 1 persona que no llegó a recibirlo, con el texto actual. No reintentamos el correo que puede haber llegado.",
    );
  });

  it("names only the people when no email is retried", () => {
    expect(retryDialogText(counts({ emails: 0, maybeSentEmails: 0 }))).toBe(
      "Reintentamos 2 personas que no llegaron a recibirlo, con el texto actual.",
    );
  });

  it("names only the emails when nobody failed at fan-out", () => {
    expect(retryDialogText(counts({ people: 0, maybeSentEmails: 0 }))).toBe(
      "Reintentamos 6 correos, con el texto actual.",
    );
  });

  it("leaves out the second sentence when nothing may have arrived", () => {
    expect(retryDialogText(counts({ maybeSentEmails: 0 }))).toBe(
      "Reintentamos 6 correos y 2 personas que no llegaron a recibirlo, con el texto actual.",
    );
  });

  it("writes large numbers as the report does", () => {
    expect(
      retryDialogText({ emails: 1_180, people: 1_240, maybeSentEmails: 1_001 }),
    ).toBe(
      "Reintentamos 1.180 correos y 1.240 personas que no llegaron a recibirlo, con el texto actual. No reintentamos los 1.001 correos que pueden haber llegado.",
    );
  });

  it("answers as the server would when there is nothing to retry", () => {
    expect(retryDialogText({ emails: 0, people: 0, maybeSentEmails: 0 })).toBe(
      "No hay nada para reintentar.",
    );
    expect(retryDialogText(counts({ emails: 0, people: 0 }))).toBe(
      "No hay nada para reintentar. No reintentamos los 3 correos que pueden haber llegado.",
    );
  });
});
