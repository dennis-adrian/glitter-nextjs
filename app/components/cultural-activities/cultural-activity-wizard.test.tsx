import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureClientEventMock = vi.hoisted(() => vi.fn());
const submitMock = vi.hoisted(() => vi.fn());
/** Lets one test skip step 2's own check, to reach the final check. */
const lenientStep2 = vi.hoisted(() => ({ value: false }));

vi.mock("@/app/lib/posthog-capture", () => ({
  captureClientEvent: captureClientEventMock,
}));
vi.mock("@/app/lib/live_acts/actions", () => ({
  createLiveAct: submitMock,
}));
vi.mock("@/app/lib/live_acts/schema", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/app/lib/live_acts/schema")>();
  const { z } = await import("zod");
  return {
    ...actual,
    buildCulturalActivityStepSchema: (
      ...args: Parameters<typeof actual.buildCulturalActivityStepSchema>
    ) =>
      lenientStep2.value && args[0] === "actividad"
        ? z.object({})
        : actual.buildCulturalActivityStepSchema(...args),
  };
});

import CulturalActivityWizard from "@/app/components/cultural-activities/cultural-activity-wizard";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";

/** The phone layout and the desktop card both render in jsdom; either works. */
function clickPrimary(name: string) {
  fireEvent.click(screen.getAllByRole("button", { name })[0]!);
}

function stepTitle() {
  return document.getElementById("cultural-activity-step-title")?.textContent;
}

function type(label: RegExp, value: string) {
  const input = screen.getByLabelText(label) as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

function events(name: string) {
  return captureClientEventMock.mock.calls
    .filter(([event]) => event === name)
    .map(([, properties]) => properties);
}

async function expectAlert() {
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "Revisá los campos marcados antes de enviar.",
    ),
  );
}

const DESCRIPTION = "Un taller práctico para aprender encuadernación japonesa.";

beforeEach(() => {
  window.scrollTo = vi.fn() as never;
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  captureClientEventMock.mockReset();
  submitMock.mockReset();
  lenientStep2.value = false;
});

describe("CulturalActivityWizard", () => {
  it("stays on step 1 until a type is chosen, then moves on", async () => {
    render(<CulturalActivityWizard initialCategory={null} />);
    expect(stepTitle()).toBe("¿Qué vas a hacer?");

    clickPrimary("Continuar");
    await expectAlert();
    expect(screen.getByText("Seleccioná un tipo de actividad")).toBeTruthy();
    expect(stepTitle()).toBe("¿Qué vas a hacer?");

    fireEvent.click(screen.getByRole("radio", { name: /^Música/ }));
    expect(events(POSTHOG_EVENTS.LIVE_ACT_CATEGORY_SELECTED)).toEqual([
      { category: "music" },
    ]);
    clickPrimary("Continuar");

    await waitFor(() => expect(stepTitle()).toBe("Tu actividad"));
    expect(screen.getByText("Nombre artístico")).toBeTruthy();
    expect(events(POSTHOG_EVENTS.LIVE_ACT_FORM_STEP_VIEWED)).toEqual([
      { step_number: 1, step_name: "tipo" },
      { step_number: 2, step_name: "actividad" },
    ]);
  });

  it("asks what the other activity is, and requires it", async () => {
    render(<CulturalActivityWizard initialCategory={null} />);
    expect(screen.queryByLabelText(/¿Qué tipo de actividad es\?/)).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: /^Otra actividad/ }));
    clickPrimary("Continuar");

    await waitFor(() =>
      expect(screen.getByText("Contanos qué tipo de actividad es")).toBeTruthy(),
    );
    expect(stepTitle()).toBe("¿Qué vas a hacer?");

    type(/¿Qué tipo de actividad es\?/, "Feria de fanzines");
    clickPrimary("Continuar");
    await waitFor(() => expect(stepTitle()).toBe("Tu actividad"));
    expect(screen.getByText("Nombre de la actividad")).toBeTruthy();
  });

  it("requires a workshop's capacity and the no-cost acknowledgement", async () => {
    render(<CulturalActivityWizard initialCategory="workshop" />);
    expect(stepTitle()).toBe("Tu actividad");

    type(/Tallerista y nombre del taller/, "Ana Rojas · Encuadernación");
    type(/Descripción del taller/, DESCRIPTION);
    type(/Enlace al plan del taller/, "https://drive.google.com/x");
    clickPrimary("Continuar");

    await expectAlert();
    expect(
      screen.getByText("Ingresá cuántas personas pueden participar"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Tenés que aceptar que el taller no tenga costo para quienes participan",
      ),
    ).toBeTruthy();

    type(/Cupo de participantes/, "20");
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Entiendo que el taller no debe tener costo/,
      }),
    );
    clickPrimary("Continuar");
    await waitFor(() => expect(stepTitle()).toBe("Contacto"));
  });

  it("starts on step 2 from ?tipo=, with step 1 done", () => {
    render(<CulturalActivityWizard initialCategory="talk" />);
    expect(stepTitle()).toBe("Tu actividad");
    expect(
      screen.getByText(
        "Contanos de qué vas a hablar y compartí el contenido de tu charla.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Tipo de actividad.*Charla/ }),
    ).toBeTruthy();
    expect(events(POSTHOG_EVENTS.LIVE_ACT_FORM_STEP_VIEWED)).toEqual([
      { step_number: 2, step_name: "actividad" },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Cambiar tipo" }));
    expect(stepTitle()).toBe("¿Qué vas a hacer?");
    expect(
      (
        screen.getByRole("radio", { name: /^Charla/ }) as HTMLButtonElement
      ).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("starts ?tipo=otro on step 1 with the type chosen, to ask what it is", () => {
    render(<CulturalActivityWizard initialCategory="other" />);
    expect(stepTitle()).toBe("¿Qué vas a hacer?");
    expect(screen.getByLabelText(/¿Qué tipo de actividad es\?/)).toBeTruthy();
  });

  it("sends a failed final check back to the earliest failing step", async () => {
    lenientStep2.value = true;
    render(<CulturalActivityWizard initialCategory="music" />);
    clickPrimary("Continuar");
    await waitFor(() => expect(stepTitle()).toBe("Contacto"));

    type(/Nombre del encargado/, "María Pérez");
    type(/^Correo/, "maria@example.test");
    clickPrimary("Enviar postulación");

    await waitFor(() => expect(stepTitle()).toBe("Tu actividad"));
    await expectAlert();
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("sends the raw values and shows who will hear back", async () => {
    submitMock.mockResolvedValue({ success: true });
    render(<CulturalActivityWizard initialCategory="music" />);

    type(/Nombre artístico/, "Glitter Duo");
    type(/Enlace al video/, "https://youtube.com/watch?v=1");
    clickPrimary("Continuar");
    await waitFor(() => expect(stepTitle()).toBe("Contacto"));

    type(/Nombre del encargado/, "María Pérez");
    type(/^Correo/, "Maria@Example.test");
    type(/Celular \/ WhatsApp/, "+591 71234567");
    clickPrimary("Enviar postulación");

    await waitFor(() =>
      expect(screen.getByText("Recibimos tu postulación")).toBeTruthy(),
    );
    expect(submitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "music",
        actName: "Glitter Duo",
        website: "",
      }),
    );
    expect(screen.getByText("Glitter Duo")).toBeTruthy();
    expect(screen.getByText("maria@example.test")).toBeTruthy();
    expect(screen.getByText("+591 712 34567")).toBeTruthy();
    expect(events(POSTHOG_EVENTS.LIVE_ACT_SUBMITTED)).toEqual([
      { category: "music" },
    ]);

    fireEvent.click(
      screen.getByRole("button", { name: "Postular otra actividad" }),
    );
    expect(stepTitle()).toBe("¿Qué vas a hacer?");
  });

  it("shows the server's message in the step alert", async () => {
    submitMock.mockResolvedValue({
      success: false,
      message:
        "Hiciste muchos intentos seguidos. Esperá un rato y volvé a intentar.",
    });
    render(<CulturalActivityWizard initialCategory="music" />);
    type(/Nombre artístico/, "Glitter Duo");
    type(/Enlace al video/, "https://youtube.com/watch?v=1");
    clickPrimary("Continuar");
    await waitFor(() => expect(stepTitle()).toBe("Contacto"));
    type(/Nombre del encargado/, "María Pérez");
    type(/^Correo/, "maria@example.test");
    type(/Celular \/ WhatsApp/, "+59171234567");
    clickPrimary("Enviar postulación");

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Hiciste muchos intentos seguidos.",
      ),
    );
    expect(stepTitle()).toBe("Contacto");
  });
});
