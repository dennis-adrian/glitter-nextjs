import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// CommentForm and CommentItem import the server action module, which pulls in
// the server env schema. Nothing here submits anything.
vi.mock("@/app/lib/posts/comment-actions", () => ({
  addComment: vi.fn(),
  deleteOwnComment: vi.fn(),
  hideComment: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import CommentThread from "@/app/components/blog/comment-thread";
import type { CommentNode } from "@/app/lib/posts/definitions";

function comment(): CommentNode {
  return {
    id: 1,
    body: "qué buen artículo",
    // Derived from now so the rendered timestamp never reads as stale.
    createdAt: new Date(Date.now() - 60_000),
    userId: 7,
    user: {
      id: 7,
      displayName: "Ana",
      firstName: null,
      lastName: null,
      imageUrl: null,
    },
    replies: [],
  };
}

function renderThread(props: Partial<Parameters<typeof CommentThread>[0]>) {
  return render(
    <CommentThread
      postId={1}
      postSlug="un-articulo"
      comments={[]}
      viewerId={7}
      viewerIsStaff={false}
      gated={false}
      canComment
      closed={false}
      {...props}
    />,
  );
}

afterEach(cleanup);

describe("CommentThread", () => {
  it("renders nothing when the thread is closed and empty", () => {
    const { container } = renderThread({ closed: true, comments: [] });

    expect(container.innerHTML).toBe("");
  });

  it("keeps the section when a closed thread already has comments", () => {
    renderThread({ closed: true, comments: [comment()] });

    expect(screen.getByText("1 comentario")).toBeDefined();
    expect(
      screen.getByText("Los comentarios de este artículo están cerrados."),
    ).toBeDefined();
    expect(screen.getByText("qué buen artículo")).toBeDefined();
  });

  it("invites the first comment when the thread is open and empty", () => {
    renderThread({ closed: false, comments: [] });

    expect(screen.getByText("Comentarios")).toBeDefined();
    expect(
      screen.getByText(
        "Todavía no hay comentarios. Sé la primera persona en escribir uno.",
      ),
    ).toBeDefined();
  });

  it("still explains the gate to a reader who cannot see the article", () => {
    renderThread({ gated: true, closed: true, comments: [] });

    expect(
      screen.getByText(
        "Los comentarios de este artículo son visibles solo para participantes verificados.",
      ),
    ).toBeDefined();
  });
});
