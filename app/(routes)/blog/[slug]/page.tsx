import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import PostDetail from "@/app/components/blog/post-detail";
import {
  fetchPostBySlug,
  fetchPostBySlugForWorkingPreview,
} from "@/app/lib/posts/data";
import { canEditPost } from "@/app/lib/posts/helpers";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { postAuthorName } from "@/app/lib/posts/helpers";
import { isPostGatedFor } from "@/app/lib/posts/audience";
import { isStaff } from "@/app/lib/posts/helpers";
import { fetchCommentThread } from "@/app/lib/posts/comments";
import CommentThread from "@/app/components/blog/comment-thread";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
};

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const isPreview = sp.preview === "working";
  const post = await (isPreview
    ? fetchPostBySlugForWorkingPreview(slug)
    : fetchPostBySlug(slug));
  // Hand the miss to the not-found boundary rather than titling the 404 page
  // as if it were an article. Note this does not change the status code: every
  // dynamic route in this app currently answers a `notFound()` with 200 and
  // 404 content — `/programs/<missing>` and `/festivals/<missing>` do the same
  // — so the soft 404 is a platform-level issue, not one this page can fix.
  if (!post) notFound();

  const effectiveTitle = isPreview
    ? (post.workingTitle ?? post.title)
    : post.title;
  // A preview should show the staged SEO title, the way the description
  // already prefers `workingSeoDescription`. Falling straight through to the
  // live `seoTitle` made the preview show the published title while showing
  // the staged body.
  const effectiveSeoTitle = isPreview
    ? (post.workingSeoTitle ?? post.seoTitle)
    : post.seoTitle;
  // The cover has to follow the same rule as the title and the description,
  // or a preview of a staged cover swap unfurls with the published image.
  const effectiveCoverImageUrl = isPreview
    ? (post.workingCoverImageUrl ?? post.coverImageUrl)
    : post.coverImageUrl;
  const title = effectiveSeoTitle ?? `${effectiveTitle} | Productora Glitter`;
  const description =
    (isPreview ? (post.workingSeoDescription ?? post.workingExcerpt) : null) ??
    post.seoDescription ??
    post.excerpt ??
    "Artículo del blog de Glitter";
  const authorName = postAuthorName(post.author);

  return {
    title,
    description,
    // A restricted article is listed for people browsing the site, not for
    // search engines: indexing it would publish a gate as a thin result.
    robots:
      isPreview || post.audience === "participants"
        ? { index: false, follow: false }
        : undefined,
    openGraph: {
      title,
      description,
      type: "article",
      url: `/blog/${post.slug}`,
      images: effectiveCoverImageUrl
        ? [{ url: effectiveCoverImageUrl }]
        : undefined,
      publishedTime: post.publishedAt
        ? new Date(post.publishedAt).toISOString()
        : undefined,
      authors: [authorName],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: effectiveCoverImageUrl ? [effectiveCoverImageUrl] : undefined,
    },
  };
}

export default async function BlogPostPage({
  params,
  searchParams,
}: PageProps) {
  // Phase one ships the blog dark: the routes exist but answer 404 until the
  // flag is public. `admin_only` lets staff walk the real thing in production
  // before it is announced.
  if (!(await isFeatureEnabled("blog"))) notFound();

  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const isPreview = sp.preview === "working";

  if (isPreview) {
    const profile = await getCurrentUserProfile();
    if (!profile) notFound();
    const post = await fetchPostBySlugForWorkingPreview(slug);
    if (!post) notFound();
    if (!canEditPost(profile, post)) notFound();
    const previewPost = {
      ...post,
      title: post.workingTitle ?? post.title,
      excerpt: post.workingExcerpt ?? post.excerpt,
      coverImageUrl: post.workingCoverImageUrl ?? post.coverImageUrl,
      content: post.workingContent ?? post.content,
      contentHtml: post.workingContentHtml ?? post.contentHtml,
      seoTitle: post.workingSeoTitle ?? post.seoTitle,
      seoDescription: post.workingSeoDescription ?? post.seoDescription,
    };
    return <PostDetail post={previewPost} previewBanner />;
  }

  const post = await fetchPostBySlug(slug);
  if (!post) notFound();

  // Resolved only for a restricted article: a public one must not pay for an
  // auth round-trip, and reading the profile is what makes the page personal.
  const viewer =
    post.audience === "participants" ? await getCurrentUserProfile() : null;
  const gated = isPostGatedFor(viewer, post);

  // Comments follow the gate: someone who cannot read the article cannot
  // write under it either. The action re-checks this independently.
  const commenter =
    post.audience === "participants" ? viewer : await getCurrentUserProfile();
  // Not fetched at all when gated: the cheapest way to not leak a thread is
  // to never put it in the response.
  const comments = gated ? [] : await fetchCommentThread(post.id);

  return (
    <>
      <PostDetail
        post={gated ? { ...post, contentHtml: "" } : post}
        gateReason={gated ? (viewer ? "unverified" : "anonymous") : null}
      />
      <div className="mx-auto max-w-3xl px-4 pb-12">
        <CommentThread
          postId={post.id}
          postSlug={post.slug}
          comments={comments}
          viewerId={commenter?.id ?? null}
          viewerIsStaff={isStaff(commenter?.role)}
          gated={gated}
          canComment={Boolean(commenter) && !gated}
          closed={!post.commentsEnabled}
        />
      </div>
    </>
  );
}
