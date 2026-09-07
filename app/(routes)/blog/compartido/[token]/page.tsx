import type { Metadata } from "next";
import { notFound } from "next/navigation";

import PostDetail from "@/app/components/blog/post-detail";
import SharedPostBanner from "@/app/components/blog/shared-post-banner";
import { postAuthorName } from "@/app/lib/posts/helpers";
import { resolveSharedPost } from "@/app/lib/posts/share-links";

type PageProps = {
  params: Promise<{ token: string }>;
};

/**
 * The token is the whole address, so this route deliberately does not carry
 * the slug: a draft's slug changes the first time it leaves `draft` — the
 * `borrador` placeholder is swapped for a title-derived one — and a link
 * already sent to someone must not break when that happens.
 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { token } = await params;
  const post = await resolveSharedPost(token);
  if (!post) notFound();

  return {
    title: `${post.title} | Productora Glitter`,
    description: post.excerpt ?? "Artículo compartido",
    /**
     * Never indexed, and no `follow` either: the point of the link is that it
     * reaches the people it was sent to and nobody else. An unfurl in a chat
     * still resolves, which is what makes the link usable.
     */
    robots: { index: false, follow: false },
  };
}

export default async function SharedPostPage({ params }: PageProps) {
  const { token } = await params;

  /**
   * No `blog` feature-flag check on purpose. The flag stages the *public*
   * blog; this route is how an author shows unpublished work to a few people,
   * which is most useful precisely while the blog is still dark. Access here
   * is the token, and the token is issued only by someone who can edit the
   * post.
   */
  const post = await resolveSharedPost(token);
  if (!post) notFound();

  return (
    <>
      <div className="mx-auto max-w-3xl px-4 pt-8">
        <SharedPostBanner
          status={post.status}
          authorName={postAuthorName(post.author)}
        />
      </div>
      {/*
        Comments are absent rather than disabled: a recipient may not be signed
        in at all, and a shared draft is a document to read, not a thread. The
        published article keeps its own discussion at /blog/<slug>.
      */}
      <PostDetail post={post} />
    </>
  );
}
