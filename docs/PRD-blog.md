# Blog Feature PRD

## 1) Overview

The Blog feature introduces a content surface within the Glitter site for publishing tutorials, tips, and useful articles related to our festivals. It is composed of (a) a Notion-like, block-based WYSIWYG editor inside the dashboard for authoring, (b) an editorial review workflow that allows experienced participants to contribute articles for admin approval, and (c) a public-facing blog with a list page, article detail page, category and tag browse pages. The feature ships in two phases: Phase 1 covers authoring, review, taxonomy, and public reading; Phase 2 adds reader comments and scheduled publishing.

The implementation reuses existing platform conventions: Drizzle/Postgres schema in `db/schema.ts`, server actions in `app/lib/<feature>/`, dashboard routes under `app/dashboard/`, public routes under `app/(routes)/`, UploadThing for image uploads, Clerk for auth, Spanish-first UI labels, and `cacheTag` / `revalidatePath` for cache invalidation.

## 2) Problem Statement

The Glitter platform currently has no content surface for long-form, evergreen information targeted at festival participants and visitors. Today, organizers communicate tutorials, FAQs, and tips through ad-hoc channels (social media, WhatsApp, email), which is hard to discover, easy to lose, and not indexable. Experienced participants who could share valuable knowledge have no in-platform way to do so.

We need:

- A first-class authoring surface within the platform.
- A controlled contribution workflow that lets vetted participants write articles without giving up editorial control.
- A discoverable, SEO-friendly public reading experience in Spanish.
- A safe extension path to add interaction (comments) and time-based publishing later.

## 3) Goals

- Goal 1: Provide a Notion-like block-based WYSIWYG editor (BlockNote) with toolbar + slash menu for authoring articles inside the dashboard.
- Goal 2: Support an editorial workflow where admins publish directly and eligible non-admins submit drafts for admin review, approval, and publication.
- Goal 3: Render published articles on a public blog (list, article detail, category, tag) with SEO metadata and server-side rendered HTML.
- Goal 4: Support cover images via the existing UploadThing flow.
- Goal 5: Phase 2 — allow authenticated readers to comment on published articles, and allow admins to schedule publication for a future date/time.
- Goal 6: Spanish-first UI; slugs derived from titles with accent stripping.

## 4) Non-Goals

- Multilingual / i18n articles. Articles are Spanish-only in v1.
- Newsletter delivery, RSS export beyond a basic feed, push notifications.
- Rich personalization or recommendation engine.
- Inline analytics dashboards beyond basic counts.
- Multi-author collaboration on a single draft (one author per post).
- Versioning / revision history beyond `updatedAt`.
- WYSIWYG block plugins beyond BlockNote defaults (e.g., custom embeds, polls).

## 5) Users & Roles

- **Admin (`role = "admin"`)**: Full access. Can create, edit any post, publish directly, approve/reject submissions, schedule, archive, manage categories, and moderate comments.
- **Festival admin (`role = "festival_admin"`)**: Same permissions as admin for blog content management in v1 (treated as admin for blog purposes).
- **Eligible user**: Any authenticated user that has at least **3 confirmed participations across at least 3 distinct festivals** (all-time). Can create drafts, edit their own drafts/submitted posts, and submit for review. Cannot publish, schedule, or approve.
- **Authenticated user**: Can read public posts and (Phase 2) comment.
- **Public visitor**: Can read public posts only.

Eligibility is recomputed live (not cached on the user row) by the helper `canAuthorPosts(user)`.

## 6) User Stories

- As an admin, I can write an article using a Notion-like block editor and publish it immediately.
- As an admin, I can review a queue of articles submitted by eligible users, request changes with notes, reject, or approve and publish.
- As an admin, I can manage categories, edit any post, archive a published post, and (Phase 2) schedule a post for future publication.
- As an eligible user, I can write a draft, save progress, attach a cover image and tags, and submit for review.
- As an eligible user, I can see review status and read reviewer notes when changes are requested.
- As a visitor, I can browse the latest published articles, filter by category or tag, and read an article with proper SEO metadata.
- As an authenticated reader (Phase 2), I can comment on a published article and reply once to another comment.

## 7) Functional Requirements

### 7.1 Authoring (Phase 1)

- Editor: BlockNote with default block types (paragraph, headings 1-3, bulleted/numbered/check lists, quote, code, image, divider). Toolbar + slash menu.
- Image blocks upload through the existing UploadThing route.
- Editor stores content as BlockNote JSON; on save, content is also rendered to sanitized HTML and persisted (`contentHtml`) for fast public reads and SEO.
- Each post has: `title`, `slug` (auto-suggested from title, editable, unique), `excerpt`, `coverImageUrl`, `content` (jsonb), `contentHtml` (text), `seoTitle`, `seoDescription`, `categories[]`, `tags[]`, `authorId`, `status`, `publishedAt`, `scheduledAt` (Phase 2), `reviewerId`, `reviewerNotes`, `createdAt`, `updatedAt`.
- Slug generation: lowercase, accent-stripped, non-alphanumerics → `-`, collapsed dashes, suffix `-2`, `-3`, … on collision.

### 7.2 Status Model

`postStatusEnum`: `draft`, `submitted`, `approved`, `scheduled`, `published`, `rejected`, `archived`.

Allowed transitions:

- `draft` → `submitted` (eligible user) or `published` (admin direct publish) or `archived` (admin)
- `submitted` → `approved` | `rejected` | `draft` (admin requests changes, returns to author with `reviewerNotes`)
- `approved` → `published` | `scheduled` (Phase 2)
- `scheduled` → `published` (cron, Phase 2) | `draft` (admin cancels schedule)
- `published` → `archived` (admin)
- `rejected` → `draft` (author edits and resubmits) | terminal
- `archived` → `published` (admin restores)

### 7.3 Editorial Workflow

- Admin direct publish: admin can flip from `draft` → `published` in one action.
- Eligible user submits: post goes to `submitted`. The post is read-only for the author until the admin returns it to `draft`.
- Admin review queue at `/dashboard/blog/review` shows all `submitted` posts. Actions: **Approve & publish**, **Request changes** (returns to `draft`, requires notes), **Reject** (terminal but author can clone or recover).
- Reviewer notes are visible to the author when status is `draft` after a `submitted` round-trip and after a `rejected` decision.

### 7.4 Taxonomy

- **Categories**: admin-curated, finite set, each with `slug` and `name`. Posts can have one or more categories.
- **Tags**: free-form, created on the fly while authoring, each with `slug` and `name`. Many-to-many with posts.
- Public browse pages exist for both: `/blog/category/[slug]`, `/blog/tag/[slug]`.

### 7.5 Public Blog (Phase 1)

- `/blog` — paginated list of `published` posts ordered by `publishedAt desc`. Filters: category, tag, free-text search over `title` + `excerpt`.
- `/blog/[slug]` — article page. Renders `contentHtml`, shows author display name + avatar, publish date, categories, tags, cover image. Provides Open Graph + Twitter meta from `seoTitle`/`seoDescription`/`coverImageUrl`.
- `/blog/category/[slug]` and `/blog/tag/[slug]` — same list shape, filtered.
- Pages use `cacheTag("blog-posts")`; mutations call `updateTag("blog-posts")` and `revalidatePath` for affected paths.

### 7.6 Comments (Phase 2)

- Authenticated users can post comments on `published` posts.
- One level of replies (no deeper nesting).
- Each comment has `id`, `postId`, `userId`, `body` (plain text, max ~1000 chars), `parentId` (nullable), `isHidden`, `createdAt`.
- Admins can hide individual comments (`isHidden = true`); hidden comments are not rendered.
- Per-user rate limit: max 5 comments / minute / post.
- No edit; users can delete their own comments (soft delete via `isHidden` + ownership check).

### 7.7 Scheduled Publishing (Phase 2)

- Admin can pick a `scheduledAt` (timezone: festival timezone, default `America/La_Paz`). Status flips to `scheduled`.
- Cron route `app/api/cron/publish-scheduled-posts/route.ts` runs every 15 minutes, flips `scheduled` → `published` where `scheduledAt <= now()`, sets `publishedAt = now()`.
- Cron registered in `vercel.json`.
- Admin can cancel a schedule (returns post to `draft`).

## 8) Technical Design Summary

### 8.1 Schema (`db/schema.ts`)

New enum and tables:

- `postStatusEnum`: see §7.2.
- `posts`: as in §7.1.
- `postCategories`, `postCategoriesToPosts`.
- `postTags`, `postTagsToPosts`.
- `postComments` (Phase 2).

Relations registered for posts ↔ author, posts ↔ categories, posts ↔ tags, posts ↔ comments, comments ↔ replies.

### 8.2 Server Actions (`app/lib/posts/`)

- `actions.ts`:
  - `createPost`, `updatePost`, `deleteDraft`
  - `submitForReview` (eligible user only)
  - `requestChanges` (admin only — sets status `draft`, persists `reviewerNotes`)
  - `approveAndPublish` (admin only — sets status `published`, `publishedAt = now()`)
  - `reject` (admin only)
  - `schedulePost`, `cancelSchedule` (Phase 2, admin only)
  - `archivePost`, `restorePost` (admin only)
  - `addComment`, `hideComment`, `deleteOwnComment` (Phase 2)
- `eligibility.ts`: `canAuthorPosts(user)` — admins always; non-admins eligible if SQL count of confirmed participations grouped by `festivalId` returns ≥ 3 distinct festivals with at least one confirmed participation each.
- `data.ts`: `fetchPublishedPosts({ category?, tag?, q?, page })`, `fetchPostBySlug`, `fetchAuthoredPosts(userId)`, `fetchSubmittedPosts()` (admin queue), `fetchCategories`, `fetchTags`.
- `definitions.ts`: shared types (`PostRow`, `PostWithAuthor`, `PostStatus`, `PostFormValues`).
- `render.ts`: `renderBlockNoteToHtml(content)` using `@blocknote/server-util`. Output is sanitized before persisting.
- `validate.ts`: zod schemas for create/update/submit; slug generator.

### 8.3 Dashboard Routes (`app/dashboard/blog/`)

- `page.tsx` — list of own posts (eligible users) or all posts (admins) with status filters.
- `new/page.tsx` — create a draft.
- `[id]/edit/page.tsx` — edit a draft/returned post.
- `review/page.tsx` — admin-only review queue.
- `categories/page.tsx` — admin-only category manager.
- The dashboard layout's role gate is extended so eligible non-admin users can reach `/dashboard/blog/*` (but not the rest of the dashboard).

### 8.4 Public Routes (`app/(routes)/blog/`)

- `page.tsx` — list with pagination, category/tag/search query params.
- `[slug]/page.tsx` — article detail, generates `metadata` from post fields.
- `category/[slug]/page.tsx`, `tag/[slug]/page.tsx`.
- All read paths use `"use cache"` + `cacheTag("blog-posts")` per existing conventions.

### 8.5 Components (`app/components/blog/`)

- `post-editor.tsx` (client) — wraps BlockNote, handles save/submit, slug input, cover upload, category/tag pickers, SEO fields.
- `post-card.tsx`, `post-list.tsx`, `post-detail.tsx`, `category-pill.tsx`, `tag-pill.tsx`.
- `review-queue-table.tsx`, `status-badge.tsx`, `reviewer-notes-banner.tsx`.
- `comment-thread.tsx`, `comment-form.tsx` (Phase 2).

Per repo convention, all components live in `app/components/`, not under route folders.

### 8.6 Caching & Revalidation

- Read paths use `"use cache"`, `cacheLife("hours")`, `cacheTag("blog-posts")`.
- Write paths call `updateTag("blog-posts")` and targeted `revalidatePath("/blog", "layout")`, `revalidatePath("/blog/[slug]", "page")`.

### 8.7 Editor & Renderer

- BlockNote (`@blocknote/react`, `@blocknote/mantine`) drives the client editor.
- BlockNote → HTML conversion runs server-side on save via `@blocknote/server-util`. Output passes through a sanitization pass (allowlist of tags/attrs) before being persisted to `contentHtml`.
- Image blocks call the existing UploadThing endpoint and persist returned URLs into BlockNote JSON.

## 9) API & Server-Action Contract

Server actions (Phase 1):

- `createPost(input)` — author = current user, status = `draft`. Requires `canAuthorPosts`.
- `updatePost(id, input)` — author or admin. Author can only edit when status ∈ {`draft`, `rejected`}.
- `submitForReview(id)` — author only, status `draft` → `submitted`.
- `approveAndPublish(id)` — admin only, status `submitted` → `published`.
- `requestChanges(id, notes)` — admin only, status `submitted` → `draft`; persists `reviewerNotes`.
- `reject(id, notes)` — admin only, status `submitted` → `rejected`.
- `archivePost(id)`, `restorePost(id)` — admin only.
- `createCategory`, `updateCategory`, `deleteCategory` — admin only.

Phase 2:

- `schedulePost(id, scheduledAt)`, `cancelSchedule(id)` — admin only.
- `addComment(postId, body, parentId?)` — authenticated.
- `hideComment(id)` — admin only.
- `deleteOwnComment(id)` — author only.

Cron (Phase 2):

`GET /api/cron/publish-scheduled-posts`

- Auth: header check identical to existing cron jobs.
- Behavior: flips `scheduled` → `published` where `scheduledAt <= now()`, sets `publishedAt`, calls `updateTag("blog-posts")`.
- Response: `200` with `{ promoted: <count> }`; `401` on bad auth.

## 10) UX Requirements

- Editor provides a clear status pill ("Borrador", "En revisión", "Aprobado", "Programado", "Publicado", "Rechazado", "Archivado") and contextual actions only.
- Cover image uploader supports drag-drop and shows aspect-ratio guidance (target 16:9).
- Slug field shows live preview of the public URL and validates uniqueness on blur.
- Reviewer notes are surfaced as a prominent banner above the editor when present.
- Public blog uses readable typography, max-width content column, generous spacing; cards on `/blog` show cover image + title + excerpt + author + date.
- All copy is in Spanish first.

## 11) Acceptance Criteria

### Phase 1

1. Admin can create, edit, and publish a blog post entirely from `/dashboard/blog/*`.
2. Eligible user (≥3 confirmed participations across ≥3 festivals) can create a draft and submit it for review; non-eligible users see no entry point.
3. Admin review queue shows all `submitted` posts, with working **Approve & publish**, **Request changes**, and **Reject** actions.
4. Public `/blog` page lists only `published` posts ordered by `publishedAt desc` with working pagination.
5. Public article page renders sanitized HTML, shows author and metadata, and exposes correct Open Graph + Twitter meta tags.
6. Categories and tags filter the public list correctly; tag pages exist for any tag attached to a published post.
7. Slug uniqueness is enforced; collisions auto-suffix.
8. All UI labels are in Spanish.
9. Cache tags invalidate after publish/edit; public readers see fresh content within seconds.

### Phase 2

10. Authenticated users can post and (one-level) reply to comments on published posts; admins can hide comments.
11. Admin can schedule a post for a future date/time; cron flips it to `published` within ≤ 15 minutes of `scheduledAt`.
12. Cancelling a schedule returns the post to `draft`.

## 12) Risks & Mitigations

- Risk: BlockNote JSON drift / sanitizer mismatch leading to unsafe HTML.
  - Mitigation: Server-side render + allowlist sanitizer; never trust client-provided HTML.
- Risk: Eligibility check is expensive when run on every dashboard load.
  - Mitigation: Single SQL query (group-by festival, having count ≥ 1, distinct festivals ≥ 3); memoize per request.
- Risk: Editorial loop confusion for contributors (status not obvious).
  - Mitigation: Status pill, banner with reviewer notes, explicit Spanish copy on each action button.
- Risk: Scheduled publish missed due to cron downtime.
  - Mitigation: Cron is idempotent and uses `<= now()`; next run picks up missed items.
- Risk: Comment spam or abuse (Phase 2).
  - Mitigation: Auth required, rate limit per user/post, admin hide action, hidden-by-default flag for first-time commenters (future).

## 13) Future Enhancements

- Revision history with diff view.
- RSS/Atom feed.
- Author profile pages aggregating their published posts.
- Multilingual articles (Spanish + English).
- Newsletter delivery for new posts.
- Reactions (likes / saves) on articles.
- Inline embeds (YouTube, Instagram, festival activity cards).
- Per-post analytics (views, read time).
- Editorial co-authoring and assignment.
