import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { Text } from "@react-email/components";
import { describe, expect, it } from "vitest";

import InfractionLifecycleEmail from "@/app/emails/infraction-lifecycle";
import SanctionLifecycleEmail from "@/app/emails/sanction-lifecycle";

const profile = {
  id: 1,
  displayName: "Yoko_katt",
  firstName: null,
  lastName: null,
  email: "participant@example.com",
};

function findTextContaining(
  node: ReactNode,
  expectedText: string,
): ReactElement<{ children?: ReactNode }> | undefined {
  if (!isValidElement(node)) return undefined;

  const element = node as ReactElement<{ children?: ReactNode }>;
  if (
    element.type === Text &&
    JSON.stringify(element.props.children).includes(expectedText)
  ) {
    return element;
  }

  let match: ReactElement<{ children?: ReactNode }> | undefined;
  Children.forEach(element.props.children, (child) => {
    match ??= findTextContaining(child, expectedText);
  });
  return match;
}

function findElementOfType(
  node: ReactNode,
  expectedType: string,
): ReactElement<{ children?: ReactNode }> | undefined {
  if (!isValidElement(node)) return undefined;

  const element = node as ReactElement<{ children?: ReactNode }>;
  if (element.type === expectedType) return element;

  let match: ReactElement<{ children?: ReactNode }> | undefined;
  Children.forEach(element.props.children, (child) => {
    match ??= findElementOfType(child, expectedType);
  });
  return match;
}

describe("disciplinary lifecycle email content", () => {
  it("describes an infraction in sentences and keeps its id as a reference", () => {
    const email = InfractionLifecycleEmail({
      profile,
      kind: "registered",
      infractionId: 3,
      typeLabel: "Incumplimiento administrativo",
      festivalName: null,
      note: null,
    });
    const content = JSON.stringify(email);

    expect(content).toContain("El motivo registrado es");
    expect(content).toContain(
      "No está relacionada con un festival específico.",
    );
    expect(content).toContain("Referencia: infracción #");
    expect(content).not.toContain("·");
    expect(content).not.toContain("Global");
  });

  it("turns sanction type, scope, and related infractions into natural copy", () => {
    const email = SanctionLifecycleEmail({
      profile,
      kind: "approved",
      sanctionId: 7,
      typeLabel: "Ban",
      statusLabel: "Activa",
      scopeLabel: "Global",
      infractionLabels: ["No Show", "Incumplimiento administrativo"],
      note: null,
    });
    const content = JSON.stringify(email);

    expect(content).toContain("un bloqueo del acceso a las reservas");
    expect(content).toContain(
      "Esta medida se aplicará empezando el próximo festival.",
    );
    expect(content).toContain("La medida se tomó por los siguientes motivos:");
    expect(content).toContain("Referencia: sanción #");
    expect(content).not.toContain("·");
    expect(content).not.toContain("Sanción #");

    const summaryParagraph = findTextContaining(
      email,
      "Queremos informarte que",
    );
    expect(JSON.stringify(summaryParagraph?.props.children)).toContain(
      "un bloqueo del acceso a las reservas",
    );
    expect(JSON.stringify(summaryParagraph?.props.children)).toContain(
      "Esta medida se aplicará empezando el próximo festival.",
    );
    expect(JSON.stringify(summaryParagraph?.props.children)).toContain(
      "La medida se tomó por los siguientes motivos:",
    );

    const reasonsList = findElementOfType(email, "ul");
    const reasons = Children.toArray(reasonsList?.props.children);
    expect(reasons).toHaveLength(2);
    expect(JSON.stringify(reasons)).toContain("No Show");
    expect(JSON.stringify(reasons)).toContain("Incumplimiento administrativo");
  });

  it("leads with restored reservation access without repeating sanction data", () => {
    const email = SanctionLifecycleEmail({
      profile,
      kind: "reservation_access_enabled",
      sanctionId: 8,
      typeLabel: "Retraso de reserva",
      statusLabel: "Activa",
      scopeLabel: "Glitter",
      infractionLabels: ["Incumplimiento administrativo"],
      note: null,
      festivalName: "Glitter Fest",
      reservationEligibleAt: "2026-08-01T12:00:00.000Z",
    });
    const content = JSON.stringify(email);

    expect(content).toContain("Ya podés acceder a las reservas");
    expect(content).toContain("Glitter Fest");
    expect(content).not.toContain("La medida se tomó");
    expect(content).not.toContain("Retraso de reserva");
  });
});
