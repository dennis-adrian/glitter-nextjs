// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ComunicadoComposer from "@/app/components/comunicados/admin/composer/composer";
import type { ComposerDraft } from "@/app/components/comunicados/admin/composer/types";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
  save: vi.fn(),
  previewAudience: vi.fn(),
  renderPreview: vi.fn(),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: unknown }) => (
    <a href={href}>{children as never}</a>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// BlockNote does not run in jsdom.
vi.mock("@/app/components/organisms/rich-text-editor", () => ({
  default: () => <div data-testid="editor" />,
}));
vi.mock("@/app/lib/comunicados/actions", () => ({
  saveComunicadoDraftAction: mocks.save,
  previewComunicadoAudienceAction: mocks.previewAudience,
  discardComunicadoDraftAction: vi.fn(),
  previewSkippedPeopleAction: vi.fn(),
  searchComunicadoPeopleAction: vi.fn(),
}));
vi.mock("@/app/lib/comunicados/preview-actions", () => ({
  renderComunicadoPreviewAction: mocks.renderPreview,
}));
vi.mock("@/app/lib/comunicados/test-send", () => ({
  sendComunicadoTestAction: vi.fn(),
}));

const DRAFT: ComposerDraft = {
  id: 7,
  version: 3,
  title: "",
  doc: [],
  actionLabel: null,
  actionPath: null,
  sendEmail: true,
  sendPush: false,
  audience: { festivals: [], lists: [], people: [] },
  audienceUnreadable: false,
  essential: false,
  essentialReason: null,
  scheduleMissedDetail: null,
  scheduleMissed: false,
};

function renderComposer(draft: ComposerDraft = DRAFT) {
  return render(
    <ComunicadoComposer
      draft={draft}
      festivals={[]}
      lists={[]}
      names={{
        festivals: { 1: "Glitter Navidad 2026" },
        lists: {},
        people: {},
      }}
      notificationsLaunched
      pushLaunched
      env="production"
    />,
  );
}

describe("ComunicadoComposer", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.renderPreview.mockReturnValue(new Promise(() => {}));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  it("refreshes the router on leaving after a save, so Back and the list read it again", async () => {
    mocks.save.mockResolvedValue({
      success: true,
      version: 4,
      savedAt: new Date().toISOString(),
      contentError: null,
    });
    const { unmount } = renderComposer();

    fireEvent.change(screen.getByLabelText("Título"), {
      target: { value: "Cambio de horario" },
    });
    // Leaving the field saves at once.
    fireEvent.blur(screen.getByLabelText("Título"));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    await screen.findByText("Guardado");
    expect(mocks.refresh).not.toHaveBeenCalled();

    unmount();
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
  });

  it("leaves the router alone when nothing was saved", async () => {
    const { unmount } = renderComposer();
    unmount();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("offers to count the recipients again when the count failed", async () => {
    mocks.previewAudience
      .mockResolvedValueOnce({
        success: false,
        message: "No pudimos contar los destinatarios. Probá de nuevo.",
      })
      .mockReturnValueOnce(new Promise(() => {}));
    renderComposer({
      ...DRAFT,
      audience: { festivals: [1], lists: [], people: [] },
    });

    await screen.findByText(
      "No pudimos contar los destinatarios. Probá de nuevo.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(mocks.previewAudience).toHaveBeenCalledTimes(2));
    expect(mocks.previewAudience).toHaveBeenLastCalledWith({
      audience: { festivals: [1], lists: [], people: [] },
      essential: false,
      sendEmail: true,
    });
  });
});
