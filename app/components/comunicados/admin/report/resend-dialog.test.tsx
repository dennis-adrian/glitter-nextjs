// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ResendComunicadoButton from "@/app/components/comunicados/admin/report/resend-dialog";
import type { ComunicadoResendPreview } from "@/app/lib/comunicados/contracts";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  resend: vi.fn(),
  search: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
}));
vi.mock("@/app/lib/comunicados/resend-actions", () => ({
  loadComunicadoResendPreviewAction: mocks.load,
  resendComunicadoAction: mocks.resend,
  searchComunicadoResendPeopleAction: mocks.search,
}));
vi.mock("@/app/lib/comunicados/actions", () => ({
  searchComunicadoPeopleAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success } }));

type Ready = Extract<ComunicadoResendPreview, { ok: true }>;

function previewOf(overrides: Partial<Ready> = {}): ComunicadoResendPreview {
  return {
    ok: true,
    original: { sendEmail: true, sendPush: false },
    originalEssential: false,
    currentRevision: 2,
    newcomers: 12,
    pickedByName: 0,
    eligible: 12,
    willReceive: 12,
    notReceiving: [],
    narrowed: false,
    stagingAdmins: 0,
    email: {
      sendTo: 12,
      unsubscribedAnnouncements: 0,
      unsubscribedAll: 0,
      suppressed: 0,
      invalid: 0,
      essentialOverride: 0,
    },
    pushDevices: 0,
    pushSubscriptions: 0,
    essential: false,
    essentialLapsed: false,
    typedRequired: false,
    env: "production",
    problem: null,
    ...overrides,
  };
}

function open(props: { essential?: boolean } = {}) {
  render(
    <ResendComunicadoButton
      comunicadoId={7}
      title="Cambio de horario"
      sentChannels={{ email: true, push: false }}
      essential={props.essential ?? false}
      pushLaunched
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Enviar a más personas" }),
  );
  return screen.getByRole("dialog");
}

function sendButton() {
  return screen.getByRole("button", {
    name: /^Enviar( a|$)/,
  }) as HTMLButtonElement;
}

describe("ResendComunicadoButton (G10)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.load.mockResolvedValue({ success: true, preview: previewOf() });
    mocks.search.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("counts the newcomers with the original's channels when it opens", async () => {
    open();
    await screen.findByText(
      "12 personas nuevas en la audiencia desde el envío",
    );
    expect(mocks.load).toHaveBeenCalledWith({
      comunicadoId: 7,
      includeAudience: true,
      people: [],
      sendEmail: true,
      sendPush: false,
    });
    expect(sendButton().textContent).toBe("Enviar a 12 personas");
    expect(sendButton().disabled).toBe(false);
  });

  it("counts again with the channels changed, and resends with them", async () => {
    open();
    await screen.findByText(
      "12 personas nuevas en la audiencia desde el envío",
    );
    fireEvent.click(screen.getByLabelText("Por correo"));
    fireEvent.click(screen.getByLabelText("Notificación en el dispositivo"));
    await waitFor(() =>
      expect(mocks.load).toHaveBeenLastCalledWith(
        expect.objectContaining({ sendEmail: false, sendPush: true }),
      ),
    );
    await waitFor(() => expect(sendButton().disabled).toBe(false));

    mocks.resend.mockResolvedValue({
      success: true,
      message: "Se lo estamos enviando a 12 personas más.",
    });
    fireEvent.click(sendButton());
    await waitFor(() => expect(mocks.success).toHaveBeenCalled());
    expect(mocks.resend).toHaveBeenCalledWith({
      comunicadoId: 7,
      includeAudience: true,
      people: [],
      sendEmail: false,
      sendPush: true,
      requestKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
      expectEssential: false,
      typedCount: null,
    });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("asks for the typed count when it is essential, and offers no picker", async () => {
    mocks.load.mockResolvedValue({
      success: true,
      preview: previewOf({
        essential: true,
        typedRequired: true,
        eligible: 3,
        newcomers: 3,
      }),
    });
    open({ essential: true });
    await screen.findByText(/Sale como correo esencial/);
    expect(
      screen.queryByRole("button", { name: "Agregar por nombre o correo" }),
    ).toBeNull();
    expect(sendButton().disabled).toBe(true);
    fireEvent.change(
      screen.getByLabelText(
        "Para confirmar, escribí la cantidad de personas: 3",
      ),
      { target: { value: "3" } },
    );
    expect(sendButton().disabled).toBe(false);
  });

  it("shows the refusal the server would answer, and keeps the button off", async () => {
    mocks.load.mockResolvedValue({
      success: true,
      preview: previewOf({
        newcomers: 0,
        eligible: 0,
        problem: "No hay nadie nuevo que pueda recibirlo.",
      }),
    });
    open();
    expect((await screen.findByRole("alert")).textContent).toBe(
      "No hay nadie nuevo que pueda recibirlo.",
    );
    expect(sendButton().disabled).toBe(true);
  });

  it("keeps a refusal from the resend in the dialog, and counts again", async () => {
    open();
    await screen.findByText(
      "12 personas nuevas en la audiencia desde el envío",
    );
    mocks.resend.mockResolvedValue({
      success: false,
      code: "AUDIENCE_CHANGED",
      message:
        "La audiencia cambió: ahora son 13 personas. Revisá y confirmá de nuevo.",
    });
    fireEvent.click(sendButton());
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /^La audiencia cambió/,
    );
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
  });
});
