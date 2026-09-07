# Blog Feature PRD

> Revised 2026-09-07. The first draft was written before implementation and
> drifted: it prescribed a caching API this repo does not use, defined status
> transitions no action could reach, and did not know about the working-copy
> flow or audience targeting. Where this document and the code disagreed, the
> code was usually right; this revision reconciles them and records the
> decisions that were still open. Sections marked **[new]** were not in the
> original.

## 1) Overview

The Blog feature introduces a content surface within the Glitter site for publishing tutorials, tips, and useful articles related to our festivals. It is composed of (a) a Notion-like, block-based WYSIWYG editor for authoring, (b) an editorial review workflow that allows experienced participants to contribute articles for admin approval, and (c) a public-facing blog with a list page, article detail page, category and tag browse pages. Articles can be published to everyone or restricted to verified participants.

The feature ships in two phases: Phase 1 covers authoring, review, taxonomy, audience targeting, and public reading; Phase 2 adds reader comments and scheduled publishing.

The implementation reuses existing platform conventions: Drizzle/Postgres schema in `db/schema.ts`, server actions in `app/lib/<feature>/`, admin routes under `app/dashboard/`, participant routes under `app/(routes)/portal/`, public routes under `app/(routes)/`, UploadThing for image uploads, Clerk for auth, Spanish-first UI labels, the shared rich-text stack in `app/lib/rich-text/`, and `revalidatePath` for cache invalidation.

## 2) Problem Statement

The Glitter platform currently has no content surface for long-form, evergreen information targeted at festival participants and visitors. Today, organizers communicate tutorials, FAQs, and tips through ad-hoc channels (social media, WhatsApp, email), which is hard to discover, easy to lose, and not indexable. Experienced participants who could share valuable knowledge have no in-platform way to do so.

We need:

- A first-class authoring surface within the platform.
- A controlled contribution workflow that lets vetted participants write articles without giving up editorial control.
- A discoverable, SEO-friendly public reading experience in Spanish.
- A way to address some articles to participants only, without building a second content system.
- A safe extension path to add interaction (comments) and time-based publishing later.

## 3) Goals

- Goal 1: Provide a Notion-like block-based WYSIWYG editor (BlockNote) with toolbar + slash menu for authoring articles.
- Goal 2: Support an editorial workflow where admins publish directly and eligible non-admins submit drafts for admin review, approval, and publication.
- Goal 3: Render published articles on a public blog (list, article detail, category, tag) with SEO metadata and server-side rendered HTML.
- Goal 4: Support cover images via the existing UploadThing flow.
- Goal 5: **[new]** Let an author choose an article's audience: everyone, or verified participants only.
- Goal 6: Phase 2 — allow authenticated readers to comment on published articles, and allow admins to schedule publication for a future date/time.
- Goal 7: Spanish-first UI; slugs derived from titles with accent stripping.

## 4) Non-Goals

- Multilingual / i18n articles. Articles are Spanish-only in v1.
- Newsletter delivery, RSS export, push notifications.
- Rich personalization or recommendation engine.
- Inline analytics dashboards beyond basic counts.
- Multi-author collaboration on a single draft (one author per post).
- Full revision history. The working copy (§7.3) holds exactly one pending revision; it is not a version log.
- WYSIWYG block plugins beyond BlockNote defaults (e.g., custom embeds, polls).
- Per-user or per-role audiences beyond the two in §7.8. No "this article is for these five people".

## 5) Users & Roles

- **Admin (`role = "admin"`)**: Full access. Can create, edit any post, publish directly, approve/reject submissions, schedule, archive, manage categories, and moderate comments.
- **Festival admin (`role = "festival_admin"`)**: Same permissions as admin for blog content management in v1 (treated as admin for blog purposes).
- **Eligible user**: any authenticated user with an accepted stand reservation in **at least 3 distinct festivals** (all-time). Can create drafts, edit their own posts, and submit for review. Cannot publish, schedule, or approve.
- **Verified participant**: any user with `status = "verified"`. This is the audience for participants-only articles (§7.8). Note `paused` and `banned` are separate statuses, so a paused participant loses access until reinstated.
- **Authenticated user**: can read public posts and (Phase 2) comment on any post they can read.
- **Public visitor**: can read public posts only.

Eligibility is recomputed live (not cached on the user row) by the helper `canAuthorPosts(user)`, memoized per request with React `cache`.

> The original draft defined eligibility twice and inconsistently — "3 confirmed
> participations across at least 3 distinct festivals" in one place and "≥3
> distinct festivals with at least one confirmed participation each" in another,
> which are different rules. "Confirmed" was never defined. The rule above is
> the implemented one: reservation `status = "accepted"`, counted by distinct
> festival.

## 6) User Stories

- As an admin, I can write an article using a Notion-like block editor and publish it immediately.
- As an admin, I can review a queue of articles submitted by eligible users, request changes with notes, reject, or approve.
- As an admin, I can publish an approved article now or schedule it for later.
- As an admin, I can manage categories, edit any post, and archive a published post.
- As an admin or author, I can choose whether an article is for everyone or for verified participants only.
- As an eligible user, I can write a draft, save progress, attach a cover image and tags, and submit for review.
- As an eligible user, I can see review status and read reviewer notes when changes are requested.
- As an author, I can edit an already-published article and send those edits for review without taking the live article down.
- As a visitor, I can browse the latest published articles, filter by category or tag, search, and read an article with proper SEO metadata.
- As a signed-out visitor, I can see that a participants-only article exists and understand what I need to do to read it.
- As an authenticated reader (Phase 2), I can comment on an article I can read, and reply once to another comment.

## 7) Functional Requirements

### 7.1 Authoring (Phase 1)

- Editor: BlockNote with paragraph, headings 1–4, bulleted/numbered/check lists, toggle lists, quote, code, image, divider, and table blocks. Toolbar + slash menu, Spanish dictionary.
- Audio, video, and generic file blocks are disabled — there is no upload route for them.
- Image blocks upload through the existing UploadThing route (`blogImage`).
- Editor stores content as BlockNote JSON. On save, the server renders that JSON to sanitized HTML and persists it as `contentHtml` for fast public reads and SEO. **`contentHtml` is never accepted from the client** (§8.7).
- Each post has: `title`, `slug`, `excerpt`, `coverImageUrl`, `content` (jsonb), `contentHtml` (text), `seoTitle`, `seoDescription`, `audience`, `categories[]`, `tags[]`, `authorId`, `status`, `submittedAt`, `publishedAt`, `scheduledAt`, `reviewerId`, `reviewerNotes`, the working-copy columns (§7.3), `createdAt`, `updatedAt`.
- Slug generation: lowercase, accent-stripped, non-alphanumerics → `-`, collapsed dashes, suffix `-2`, `-3`, … on collision.
- A new draft starts with the placeholder slug `borrador-<n>`, which is replaced with a slug derived from the title the first time the post leaves `draft`.

**Heading levels.** The post title renders as the page's `h1`. Body headings therefore start at `h2` in the public article even though the editor offers levels 1–4; level 1 in the editor is styled as the top body heading, not a second page-level `h1`.

**Slug collisions.** The two behaviours the original draft asked for conflicted — §7.1 wanted silent auto-suffixing, §10 wanted uniqueness validated on blur. Both ship, in this order: the field shows a live preview of the public URL, checks availability on blur and warns if taken, and the server still auto-suffixes as a backstop so a race can never produce a duplicate. The author is told which slug they actually got.

### 7.2 Status Model

`postStatusEnum`: `draft`, `submitted`, `approved`, `scheduled`, `published`, `rejected`, `archived`.

Allowed transitions:

| From        | To          | Who                                  |
| ----------- | ----------- | ------------------------------------ |
| `draft`     | `submitted` | author (eligible user or admin)      |
| `draft`     | `published` | admin (direct publish)               |
| `draft`     | `archived`  | admin                                |
| `submitted` | `approved`  | admin                                |
| `submitted` | `rejected`  | admin                                |
| `submitted` | `draft`     | admin (request changes, with notes)  |
| `approved`  | `published` | admin                                |
| `approved`  | `scheduled` | admin                                |
| `approved`  | `draft`     | admin (return to author, with notes) |
| `scheduled` | `published` | cron                                 |
| `scheduled` | `approved`  | admin (cancel schedule)              |
| `published` | `archived`  | admin                                |
| `rejected`  | `draft`     | author (edit and resubmit)           |
| `archived`  | `published` | admin (restore)                      |

Any transition into a non-`draft` status requires a title of at least 3 characters and a document with real content (§7.9).

> The original draft listed `submitted → approved` and `approved → published |
scheduled` but supplied only an `approveAndPublish` action, so `approved` was
> unreachable by its own API contract and shipped as a dead enum value.
> Approving and publishing are now two steps: approval blesses the content,
> publishing (or scheduling) decides the timing. Cancelling a schedule returns
> the post to `approved` rather than `draft` — the content is still approved,
> only the timing changed.

### 7.3 Editorial Workflow

- **Admin direct publish**: an admin can flip `draft` → `published` in one action.
- **Eligible user submits**: the post goes to `submitted`.
- **Admin review queue** at `/dashboard/blog/review` shows all posts awaiting a decision — both `submitted` posts and published posts with a pending working copy. Actions: **Approve**, **Request changes** (returns to `draft`, requires notes), **Reject**.
- Reviewer notes are surfaced to the author as a banner whenever present.

#### Working copy **[new — was missing entirely]**

A post that has left `draft` is no longer edited in place. Edits are staged in a parallel set of `working_*` columns and are applied to the live row only when an admin approves them.

- Applies to statuses `submitted`, `approved`, `scheduled`, `published`, `rejected`.
- Staged fields mirror the editable ones: title, slug, excerpt, cover, content, contentHtml, SEO fields, audience, categories, tags.
- `workingUpdatedAt` non-null means a staged copy exists. `workingSubmittedAt` non-null with `workingReviewerNotes` null means it is awaiting review. `workingReviewerNotes` non-null means the reviewer sent it back.
- The author can preview a staged copy at `/blog/<slug>?preview=working`, which is `noindex` and visible only to someone who may edit the post.
- Approving a staged copy merges it into the live row and clears every staged column. Discarding drops the staged copy and leaves the live row untouched.

This is what makes it safe to edit a published article: readers keep seeing the approved version until a new one is approved.

### 7.4 Taxonomy

- **Categories**: admin-curated, finite set, each with `slug`, `name`, and optional `description`. Posts can have zero or more categories. Deleting a category detaches it from its posts (the join rows go, the posts stay).
- **Tags**: free-form, created on the fly while authoring, each with `slug` and `name`. Many-to-many with posts.
  - Tags are matched by slug, so `Stands`, `stands`, and `STANDS` resolve to one tag; the first spelling used wins as the display name.
  - Maximum 20 tags per post, 40 characters each.
  - Any author may create tags. Tags with no remaining posts are not surfaced anywhere and are left in place rather than garbage-collected.
- Public browse pages exist for both: `/blog/category/[slug]`, `/blog/tag/[slug]`.

### 7.5 Public Blog (Phase 1)

- `/blog` — paginated list of `published` posts ordered by `publishedAt desc`. Filters: category, tag, and free-text search over `title` + `excerpt`, combinable.
- `/blog/[slug]` — article page. Renders `contentHtml`, shows author display name, publish date, categories, tags, cover image. Provides Open Graph + Twitter meta from `seoTitle`/`seoDescription`/`coverImageUrl`.
- `/blog/category/[slug]` and `/blog/tag/[slug]` — same list shape, filtered.
- A post whose author has deleted their account still renders, bylined "Equipo Glitter" (§7.10).

### 7.6 Comments (Phase 2)

- Authenticated users can comment on any `published` post **they are allowed to read** — so a participants-only article only accepts comments from people who can see it.
- One level of replies (no deeper nesting).
- Each comment has `id`, `postId`, `userId`, `body` (plain text, max 1000 chars), `parentId` (nullable), `isHidden`, `createdAt`, `updatedAt`.
- Admins can hide individual comments (`isHidden = true`); hidden comments are not rendered, and a hidden parent hides its replies.
- Per-user rate limit: max 5 comments per minute per post, enforced by counting that user's recent comments on that post.
- No edit. Users can delete their own comments (soft delete via `isHidden` + ownership check).
- Comments are cleared when their author's account is deleted.

### 7.7 Scheduled Publishing (Phase 2)

- From `approved`, an admin can pick a `scheduledAt` and the status flips to `scheduled`.
- Times are entered and displayed in `America/La_Paz` and stored as an absolute timestamp. (The original draft said "festival timezone" — posts have no festival association, so there is no festival to take a timezone from.)
- Cron route `app/api/cron/publish-scheduled-posts/route.ts` runs every 15 minutes, flips `scheduled` → `published` where `scheduledAt <= now()`, and sets `publishedAt = scheduledAt`.
- Auth: `CRON_SECRET` bearer token, identical to the existing jobs under `app/api/cron/morning/`.
- Cron registered in `vercel.json`.
- Admin can cancel a schedule, returning the post to `approved`.

### 7.8 Audience **[new]**

Every post carries an audience:

- **`public`** — readable by anyone. The default.
- **`participants`** — readable by users with `status = "verified"`, plus admins and festival admins.

Behaviour, chosen as **listed but gated**:

- Gated posts **appear** in `/blog`, category, tag, and search results for everyone, as a card marked with a lock and the label "Solo participantes". Titles, excerpts, and covers are therefore public.
- Opening a gated post without access renders the article header and a gate explaining what is needed, in place of the body. `contentHtml` is never sent to a viewer without access.
- Gated posts are `noindex, nofollow`. They are listed for people browsing the site, not for search engines, and indexing a gate produces a thin, useless result.
- The audience is part of the working copy, so changing it on a published post goes through review like any other edit.
- Phase 2: comments follow the gate (§7.6).

### 7.9 Publishable content **[new]**

A document counts as having real content if any block anywhere in it carries non-whitespace text, **or** if it contains an image or a table. The original check only looked at each top-level block's own inline content, which meant a table-only or image-only article — and any article whose text lived in a nested block — was treated as empty and could not be published.

### 7.10 Deleted authors **[new]**

Deleting a participant's account must not be blocked by anything they wrote.

- Published and archived posts are kept, with `authorId` set to null. Their byline falls back to "Equipo Glitter".
- Posts in every other status — draft, submitted, approved, scheduled, rejected — are deleted with the account. None of them was ever visible to a reader. A scheduled post is deliberately included: it should not publish itself after its author asked to be forgotten.
- Phase 2: their comments are deleted.

### 7.11 Rollout **[new]**

Two feature flags stage the launch. Both default to `hidden`, so merging the
code ships nothing.

- **`blog`** gates the reading surface: the public routes and the menu and
  footer links. `hidden` hides it from everyone including staff; `admin_only`
  lets staff walk the real blog in production before it is announced; `public`
  opens it.
- **`blog_contributors`** gates participant authoring: the portal CTA, the
  `/portal/blog` routes, draft creation, and the `blogImage` upload. Admins are
  checked before this flag and are never affected by it.

The phases:

| Phase                        | `blog`       | `blog_contributors` | Result                                                                                    |
| ---------------------------- | ------------ | ------------------- | ----------------------------------------------------------------------------------------- |
| Merged, not launched         | `hidden`     | `hidden`            | Nothing visible; admins can still write in `/dashboard/blog`.                             |
| Staff preview                | `admin_only` | `hidden`            | Staff read the real blog in production; participants see nothing.                         |
| **Phase one — read-only**    | `public`     | `hidden`            | Everyone reads. Only admins write, with the audience gate (§7.8) deciding who reads what. |
| **Phase two — contributors** | `public`     | `public`            | Eligible participants (§5) may write and submit for review.                               |

Phase two is a flag flip, not a deploy: the contributor flow ships complete and
dormant. `blog_contributors` also accepts per-user targeting, so a handful of
participants can be let in before everyone.

Both flags are enforced server-side — a hidden blog answers 404 on its routes,
and a participant navigating straight to `/portal/blog` is redirected — rather
than only hiding links.

## 8) Technical Design Summary

### 8.1 Schema (`db/schema.ts`)

- `postStatusEnum`, `postAudienceEnum`.
- `posts`, with `authorId` nullable and `ON DELETE SET NULL` (§7.10).
- `postCategories`, `postCategoriesToPosts`.
- `postTags`, `postTagsToPosts`.
- `postComments` (Phase 2).

Relations registered for posts ↔ author, posts ↔ reviewer, posts ↔ categories, posts ↔ tags, posts ↔ comments, comments ↔ replies.

### 8.2 Server Actions (`app/lib/posts/`)

- `actions.ts`:
  - `startNewDashboardDraft`, `startNewPortalDraft` — create a blank draft and redirect into the editor.
  - `updatePost`, `autosaveDraft`, `deletePost`, `discardWorkingCopy`
  - `submitForReview` (author; stages or submits depending on status)
  - `requestChanges` (admin — returns to `draft`, persists `reviewerNotes`)
  - `approvePost` (admin — `submitted` → `approved`, or merges a staged copy)
  - `publishApproved` (admin — `approved` → `published`)
  - `directPublish` (admin — `draft`/`approved`/`archived` → `published`)
  - `rejectPost` (admin)
  - `schedulePost`, `cancelSchedule` (Phase 2, admin only)
  - `archivePost`, `restorePost` (admin only)
  - `createPostCategory`, `updatePostCategory`, `deletePostCategory` (admin only)
  - `addComment`, `hideComment`, `deleteOwnComment` (Phase 2)
- `eligibility.ts`: `canAuthorPosts(user)`.
- `audience.ts`: `canReadPost(viewer, post)` — the single gate every read path gets its answer from.
- `anonymization.ts`: `detachPostsForDeletedUser(tx, userId)` (§7.10).
- `data.ts`: read helpers, each taking the viewer so the audience gate is applied in SQL rather than after the fact.
- `definitions.ts`: shared types.
- `render.ts`: `renderPostHtml(content)` — server-side BlockNote → sanitized HTML.
- `validate.ts`: zod schemas; slug helpers live in `slug.ts`.

### 8.3 Dashboard and portal routes

Admins work under `app/dashboard/blog/`:

- `page.tsx` — all posts, with status filters.
- `[id]/edit/page.tsx` — editor.
- `review/page.tsx` — review queue.
- `categories/page.tsx` — category manager.

Eligible non-admin contributors work under `app/(routes)/portal/blog/`:

- `page.tsx` — their own posts.
- `[id]/edit/page.tsx` — editor, without publish controls.

> The original draft proposed extending the dashboard's role gate so
> contributors could reach `/dashboard/blog/*`. A separate portal surface was
> built instead, which keeps the dashboard admin-only. There is no `new/page.tsx`:
> creating a draft is a server action that inserts a blank post and redirects,
> so the editor always has a real row to autosave into.

### 8.4 Public Routes (`app/(routes)/blog/`)

- `page.tsx` — list with pagination and category/tag/search query params.
- `[slug]/page.tsx` — article detail, generates `metadata` from post fields.
- `category/[slug]/page.tsx`, `tag/[slug]/page.tsx`.

All four read `searchParams` and are therefore dynamically rendered, which is what makes a per-viewer audience gate safe: there is no shared static cache that could serve a gated body to the wrong reader.

### 8.5 Components (`app/components/blog/`)

`post-editor.tsx`, `post-form.tsx`, `post-form-inner.tsx`, `post-settings-sheet.tsx`, `editor-top-toolbar.tsx`, `title-textarea.tsx`, `slug-field.tsx`, `cover-image-uploader.tsx`, `cover-image-toggle.tsx`, `category-multiselect.tsx`, `tag-input.tsx`, `audience-select.tsx`, `post-card.tsx`, `post-list.tsx`, `post-detail.tsx`, `post-gate.tsx`, `blog-filters.tsx`, `category-pill.tsx`, `tag-pill.tsx`, `post-pagination.tsx`, `posts-table.tsx`, `post-row-actions.tsx`, `review-actions.tsx`, `request-changes-dialog.tsx`, `reviewer-notes-banner.tsx`, `post-status-badge.tsx`, `save-indicator.tsx`, `schedule-dialog.tsx`, `comment-thread.tsx`, `comment-form.tsx`.

Per repo convention, all components live in `app/components/`, not under route folders.

### 8.6 Caching & Revalidation

Write paths call `revalidatePath("/blog", "layout")` and `revalidatePath("/blog/<slug>", "page")` for affected paths, plus the dashboard and portal lists.

> The original draft specified `"use cache"`, `cacheLife`, `cacheTag`, and
> `updateTag`, described as "existing conventions". None of those appear
> anywhere in this repository and `cacheComponents` is not enabled in
> `next.config.ts`; `revalidatePath` is the actual convention. Audience gating
> also makes a shared tag-keyed cache the wrong tool, since the correct response
> now varies per viewer.

### 8.7 Editor & Renderer

- BlockNote (`@blocknote/react`, `@blocknote/shadcn`) drives the client editor. The schema lives in `app/lib/rich-text/schemas.ts` as the `blog` variant and is shared by the client editor and the server renderer, so the two cannot drift.
- BlockNote → HTML conversion runs **server-side on save** via `@blocknote/server-util`, from the stored blocks. Output passes through the allowlist sanitizer in `app/lib/rich-text/sanitize.ts` before being persisted to `contentHtml`.
- `contentHtml` is not part of any request schema. Deriving it from `content` server-side is what keeps the reviewed document and the published document from disagreeing.
- Image blocks call the existing UploadThing endpoint and persist returned URLs into BlockNote JSON.

## 9) API & Server-Action Contract

Phase 1:

- `startNewDashboardDraft()` / `startNewPortalDraft()` — requires `canAuthorPosts`; inserts a blank draft, redirects to its editor.
- `updatePost(id, input)` / `autosaveDraft(id, input)` — author or admin. Writes to the live row while `draft`, to the working copy otherwise.
- `submitForReview(id)` — author. `draft` → `submitted`, or marks a working copy as submitted.
- `approvePost(id)` — admin. `submitted` → `approved`, or merges a submitted working copy into the live row.
- `publishApproved(id)` — admin. `approved` → `published`, sets `publishedAt`.
- `directPublish(id)` — admin. `draft` / `approved` / `archived` → `published`.
- `requestChanges(id, notes)` — admin. Returns the post to `draft` (or annotates the working copy); persists `reviewerNotes`.
- `rejectPost(id, notes)` — admin. → `rejected`.
- `archivePost(id)`, `restorePost(id)` — admin.
- `discardWorkingCopy(id)`, `deletePost(id)` — author or admin, subject to §7.10's rules.
- `createPostCategory`, `updatePostCategory`, `deletePostCategory` — admin only.

Phase 2:

- `schedulePost(id, scheduledAt)`, `cancelSchedule(id)` — admin only.
- `addComment(postId, body, parentId?)` — authenticated, and only if the caller may read the post.
- `hideComment(id)` — admin only.
- `deleteOwnComment(id)` — comment author only.

Cron (Phase 2): `GET /api/cron/publish-scheduled-posts`

- Auth: `CRON_SECRET` bearer header, matching the existing jobs.
- Behavior: flips `scheduled` → `published` where `scheduledAt <= now()`, sets `publishedAt = scheduledAt`, revalidates the affected paths.
- Response: `200` with `{ promoted: <count> }`; `401` on bad auth.
- Idempotent: a missed run is picked up by the next one.

## 10) UX Requirements

- The editor shows a status pill ("Borrador", "En revisión", "Aprobado", "Programado", "Publicado", "Rechazado", "Archivado") and only the actions valid for that status.
- The cover image uploader supports drag-drop and states the 16:9 target and size limit.
- The slug field shows a live preview of the public URL and validates uniqueness on blur (§7.1).
- Reviewer notes appear as a prominent banner above the editor whenever present.
- The audience control states plainly who will be able to read the article, and a gated post is marked as such everywhere it appears — in the editor, in the dashboard and portal tables, and on public cards.
- A reader who cannot open a gated article is told why and what to do next, rather than being 404'd or bounced to a login wall with no explanation.
- The public blog uses readable typography, a max-width content column, and generous spacing; cards on `/blog` show cover image, title, excerpt, author, and date.
- All copy is in Spanish first.

## 11) Acceptance Criteria

### Phase 1

1. Admin can create, edit, and publish a blog post entirely from `/dashboard/blog/*`.
2. Eligible user (accepted reservations in ≥3 distinct festivals) can create a draft and submit it for review; non-eligible users see no entry point.
3. Admin review queue shows everything awaiting a decision, with working **Approve**, **Request changes**, and **Reject** actions, and an approved post can then be published.
4. Public `/blog` lists only `published` posts ordered by `publishedAt desc`, with working pagination, category and tag filters, and search.
5. Public article page renders sanitized HTML, shows author and metadata, and exposes correct Open Graph + Twitter meta tags.
6. Categories and tags filter the public list correctly; tag pages exist for any tag attached to a published post.
7. Slug uniqueness is enforced, collisions auto-suffix, and the author sees the slug they actually got.
8. All UI labels are in Spanish.
9. Public readers see fresh content within seconds of a publish or edit.
10. An article set to "participants only" is listed to everyone but readable only by verified participants and admins, and is not indexed.
11. Editing a published article does not change what readers see until an admin approves the edit.
12. Deleting a participant's account succeeds even when they have authored posts; their published articles survive without a byline.

### Phase 2

13. Authenticated users can post and (one-level) reply to comments on an article they can read; admins can hide comments; a user can delete their own.
14. The comment rate limit rejects a sixth comment on the same post within a minute.
15. Admin can schedule an approved post for a future date/time; cron flips it to `published` within ≤ 15 minutes of `scheduledAt`.
16. Cancelling a schedule returns the post to `approved`.

## 12) Risks & Mitigations

- Risk: BlockNote JSON drift / sanitizer mismatch leading to unsafe HTML.
  - Mitigation: server-side render from stored blocks + allowlist sanitizer; `contentHtml` is never accepted from a client.
- Risk: a gated article's body leaks through a cache, a metadata tag, or a list endpoint.
  - Mitigation: one `canReadPost` gate, applied in the data layer; gated bodies are never serialized into a response the viewer cannot read; public routes are dynamically rendered.
- Risk: eligibility check is expensive on every dashboard load.
  - Mitigation: single grouped SQL query, memoized per request.
- Risk: editorial loop confusion for contributors.
  - Mitigation: status pill, reviewer-notes banner, explicit Spanish copy on each action.
- Risk: scheduled publish missed due to cron downtime.
  - Mitigation: cron is idempotent and uses `<= now()`; the next run picks up missed items.
- Risk: comment spam or abuse.
  - Mitigation: auth required, audience gate, per-post rate limit, admin hide action.
- Risk: a departing author's deletion is blocked or silently retried forever.
  - Mitigation: §7.10, exercised by an integration test that deletes a user who has posts.

## 13) Future Enhancements

- Revision history with diff view.
- RSS/Atom feed and a sitemap covering published posts.
- Author profile pages aggregating their published posts.
- Multilingual articles (Spanish + English).
- Newsletter delivery for new posts.
- Reactions (likes / saves) on articles.
- Inline embeds (YouTube, Instagram, festival activity cards).
- Per-post analytics (views, read time).
- Editorial co-authoring and assignment.
- Redirects from an old slug when a published article's slug changes.
- Audiences beyond the two in §7.8 (for example, a single festival's participants).
