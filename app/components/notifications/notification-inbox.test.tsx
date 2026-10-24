import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/lib/notifications/actions", () => ({
  markNotificationReadAction: vi.fn(async () => ({ success: true })),
  markNotificationUnreadAction: vi.fn(async () => ({ success: true })),
  archiveNotificationAction: vi.fn(async () => ({ success: true })),
  unarchiveNotificationAction: vi.fn(async () => ({ success: true })),
  markAllNotificationsReadAction: vi.fn(async () => ({
    success: true,
    ids: [],
  })),
  markNotificationsUnreadAction: vi.fn(async () => ({ success: true })),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { announceNotificationReceived } from "@/app/components/notifications/notification-events";
import NotificationInbox, {
  mergeFirstPage,
} from "@/app/components/notifications/notification-inbox";
import type {
  InboxNotification,
  InboxPage,
} from "@/app/lib/notifications/definitions";

function item(id: number, title = `Notificación ${id}`): InboxNotification {
  return {
    id,
    kind: "credit_gift_received",
    category: "credits",
    title,
    body: "Ya están en tu billetera.",
    actionPath: "/my_credits",
    actionLabel: "Ver mi billetera",
    creditDelta: null,
    opensDetail: false,
    readAt: null,
    createdAt: new Date().toISOString(),
  };
}

function page(items: InboxNotification[], nextCursor: string | null = null) {
  return {
    items,
    unreadCount: items.filter((entry) => entry.readAt == null).length,
    isEmptyInbox: items.length === 0,
    nextCursor,
  } satisfies InboxPage;
}

/** What the inbox API answers next, first page and "Ver más" alike. */
let answers: InboxPage[] = [];
const requests: string[] = [];

beforeEach(() => {
  answers = [];
  requests.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      requests.push(url);
      const next = answers.shift();
      return next
        ? Response.json(next)
        : Response.json({ error: "none" }, { status: 500 });
    }),
  );
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

/** Lets the pending fetches, and React, catch up. */
async function settle() {
  for (let round = 0; round < 3; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

describe("mergeFirstPage", () => {
  it("puts the fresh first page on top and keeps older pages below it", () => {
    const current = [item(9), item(8), item(5), item(4)];
    const merged = mergeFirstPage(current, page([item(10), item(9), item(8)]));
    expect(merged.items.map((entry) => entry.id)).toEqual([10, 9, 8, 5, 4]);
    expect(merged.keepsCursor).toBe(true);
  });

  it("drops what left the first page's range, and takes the page's cursor when nothing older was loaded", () => {
    // 9 was archived elsewhere; nothing older than 8 was on screen.
    const current = [item(10), item(9), item(8)];
    const merged = mergeFirstPage(current, page([item(11), item(10), item(8)]));
    expect(merged.items.map((entry) => entry.id)).toEqual([11, 10, 8]);
    expect(merged.keepsCursor).toBe(false);
  });

  it("keeps an item pushed past the page size, and the cursor after it", () => {
    // A page of three: 11 arrived, so 8 no longer fits, but it is still there.
    const current = [item(10), item(9), item(8)];
    const merged = mergeFirstPage(
      current,
      page([item(11), item(10), item(9)], "9"),
    );
    expect(merged.items.map((entry) => entry.id)).toEqual([11, 10, 9, 8]);
    expect(merged.keepsCursor).toBe(true);
  });

  it("empties the list when the first page comes back empty", () => {
    const merged = mergeFirstPage([item(3)], page([]));
    expect(merged.items).toEqual([]);
    expect(merged.keepsCursor).toBe(false);
  });

  it("uses the fresh copy of an item that changed elsewhere", () => {
    const read = { ...item(9), readAt: "2026-10-23T12:00:00.000Z" };
    const merged = mergeFirstPage([item(9)], page([read]));
    expect(merged.items[0]?.readAt).toBe(read.readAt);
  });
});

describe("the inbox on screen", () => {
  it("shows a notification that arrived while Glitter was in the background, once it comes back", async () => {
    answers.push(page([item(1, "Primera")]));
    render(
      <NotificationInbox
        initialPage={page([item(1, "Primera")])}
        filter="all"
        filters={["all", "unread"]}
      />,
    );
    await settle();

    setVisibility("hidden");
    answers.push(page([item(2, "Recibiste 20 créditos"), item(1, "Primera")]));
    setVisibility("visible");

    expect(await screen.findByText("Recibiste 20 créditos")).toBeTruthy();
    expect(screen.getByText("Primera")).toBeTruthy();
  });

  it("shows a notification that arrives while it is open", async () => {
    answers.push(page([item(1, "Primera")]));
    render(
      <NotificationInbox
        initialPage={page([item(1, "Primera")])}
        filter="all"
        filters={["all", "unread"]}
      />,
    );
    await settle();

    answers.push(page([item(2, "Recibiste 20 créditos"), item(1, "Primera")]));
    act(() => announceNotificationReceived());

    expect(await screen.findByText("Recibiste 20 créditos")).toBeTruthy();
  });

  it("asks nothing while hidden, and asks once more when one arrives mid-request", async () => {
    answers.push(page([item(1)]));
    render(
      <NotificationInbox
        initialPage={page([item(1)])}
        filter="all"
        filters={["all"]}
      />,
    );
    await settle();
    const asked = requests.length;

    setVisibility("hidden");
    act(() => announceNotificationReceived());
    await settle();
    expect(requests.length).toBe(asked);

    // One arrives while the request for coming back is still on its way.
    answers.push(page([item(1)]), page([item(2, "Nueva"), item(1)]));
    setVisibility("visible");
    act(() => announceNotificationReceived());

    expect(await screen.findByText("Nueva")).toBeTruthy();
    expect(requests.length).toBe(asked + 2);
  });

  it("keeps what 'Ver más' loaded below a refreshed first page", async () => {
    answers.push(page([item(10), item(9)], "9"));
    render(
      <NotificationInbox
        initialPage={page([item(10), item(9)], "9")}
        filter="all"
        filters={["all"]}
      />,
    );
    await settle();

    answers.push(page([item(4, "Más vieja")]));
    fireEvent.click(screen.getByRole("button", { name: /Ver más/ }));
    expect(await screen.findByText("Más vieja")).toBeTruthy();

    answers.push(page([item(11, "Recién llegada"), item(10)], "10"));
    act(() => announceNotificationReceived());

    expect(await screen.findByText("Recién llegada")).toBeTruthy();
    // 9 no longer fits the first page, but it is still in the inbox.
    expect(screen.getByText("Notificación 9")).toBeTruthy();
    expect(screen.getByText("Más vieja")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Ver más/ })).toBeNull();
  });
});
