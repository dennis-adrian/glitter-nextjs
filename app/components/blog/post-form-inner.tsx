"use client";

import { es as esDictionary } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  Eye,
  MessageSquareWarning,
  CalendarClock,
  MoreVertical,
  Settings,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { blogEditorSchema } from "@/app/lib/rich-text/schemas";
import CoverImageToggle from "@/app/components/blog/cover-image-toggle";
import EditorTopToolbar from "@/app/components/blog/editor-top-toolbar";
import PostEditor from "@/app/components/blog/post-editor";
import PostSettingsSheet from "@/app/components/blog/post-settings-sheet";
import PostStatusBadge from "@/app/components/blog/post-status-badge";
import RequestChangesDialog from "@/app/components/blog/request-changes-dialog";
import ReviewerNotesBanner from "@/app/components/blog/reviewer-notes-banner";
import ScheduleDialog from "@/app/components/blog/schedule-dialog";
import SaveIndicator, {
  type SaveStatus,
} from "@/app/components/blog/save-indicator";
import TitleTextarea from "@/app/components/blog/title-textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { Form } from "@/app/components/ui/form";
import {
  approvePost,
  autosaveDraft,
  cancelSchedule,
  directPublish,
  discardWorkingCopy,
  publishApproved,
  submitForReview,
} from "@/app/lib/posts/actions";
import type {
  PostAudience,
  PostCategoryRow,
  PostStatus,
  PostWithRelations,
  ShareLinkSummary,
} from "@/app/lib/posts/definitions";
import { hasMeaningfulContent, usesWorkingCopy } from "@/app/lib/posts/helpers";
import { slugifyName } from "@/app/lib/posts/slug";
import { postFormSchema } from "@/app/lib/posts/validate";
import { useUploadThing } from "@/app/vendors/uploadthing";

type Surface = "dashboard" | "portal";

export type PostFormProps = {
  surface: Surface;
  post: PostWithRelations;
  categoryOptions: PostCategoryRow[];
  canPublish: boolean;
  /** The post's live unlisted link, or null when it has never been shared. */
  shareLink: ShareLinkSummary | null;
};

const EMPTY_DOC = [{ type: "paragraph", content: [] }];

export default function PostFormInner({
  surface,
  post,
  categoryOptions,
  canPublish,
  shareLink,
}: PostFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [requestChangesOpen, setRequestChangesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const propHasWork = post.workingUpdatedAt !== null;
  const [localHasWork, setLocalHasWork] = useState(propHasWork);
  const hasWork = propHasWork || localHasWork;
  const workingInReview =
    post.workingSubmittedAt !== null && post.workingReviewerNotes === null;
  const workingHasRejection = post.workingReviewerNotes !== null;

  const effectiveTitle = propHasWork
    ? (post.workingTitle ?? post.title)
    : post.title;
  const effectiveSlug = propHasWork
    ? (post.workingSlug ?? post.slug)
    : post.slug;
  const effectiveExcerpt = propHasWork
    ? (post.workingExcerpt ?? "")
    : (post.excerpt ?? "");
  const effectiveCoverImageUrl = propHasWork
    ? post.workingCoverImageUrl
    : post.coverImageUrl;
  const effectiveContent = propHasWork
    ? ((post.workingContent ?? post.content) as unknown)
    : (post.content as unknown);
  const effectiveSeoTitle = propHasWork
    ? (post.workingSeoTitle ?? "")
    : (post.seoTitle ?? "");
  const effectiveSeoDescription = propHasWork
    ? (post.workingSeoDescription ?? "")
    : (post.seoDescription ?? "");
  const effectiveAudience: PostAudience = propHasWork
    ? (post.workingAudience ?? post.audience)
    : post.audience;
  const effectiveCategoryIds =
    propHasWork && post.workingCategoryIds
      ? post.workingCategoryIds
      : post.categories.map((c) => c.id);
  const effectiveTagInputs =
    propHasWork && post.workingTagInputs
      ? post.workingTagInputs
      : post.tags.map((t) => t.name);

  const [coverUrl, setCoverUrl] = useState<string | null>(
    effectiveCoverImageUrl ?? null,
  );
  const [content, setContent] = useState<unknown>(
    effectiveContent ?? EMPTY_DOC,
  );
  const [categoryIds, setCategoryIds] =
    useState<number[]>(effectiveCategoryIds);
  const [tagInputs, setTagInputs] = useState<string[]>(effectiveTagInputs);
  const [audience, setAudience] = useState<PostAudience>(effectiveAudience);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | undefined>();

  const { startUpload } = useUploadThing("blogImage");
  const uploadFile = useCallback(
    async (file: File): Promise<string> => {
      const result = await startUpload([file]);
      const url = result?.[0]?.serverData?.imageUrl;
      if (!url) throw new Error("No se pudo subir la imagen");
      return url;
    },
    [startUpload],
  );

  const editor = useCreateBlockNote({
    schema: blogEditorSchema as never,
    // biome-ignore lint/suspicious/noExplicitAny: BlockNote initial content is loosely typed
    initialContent: (effectiveContent as any) ?? undefined,
    dictionary: esDictionary,
    uploadFile,
  });

  const lastSerializedRef = useRef<string>("");

  const form = useForm({
    resolver: zodResolver(postFormSchema),
    defaultValues: {
      title: effectiveTitle,
      slug: effectiveSlug,
      excerpt: effectiveExcerpt,
      coverImageUrl: effectiveCoverImageUrl ?? "",
      seoTitle: effectiveSeoTitle,
      seoDescription: effectiveSeoDescription,
      content: effectiveContent ?? EMPTY_DOC,
      categoryIds: effectiveCategoryIds,
      tagInputs: effectiveTagInputs,
    },
  });

  const watchedValues = useWatch({ control: form.control });

  const status: PostStatus = post.status;
  const editorReadOnly = workingInReview && !canPublish;
  const autosaveEligible = !editorReadOnly;

  const titleValue: string = watchedValues?.title ?? effectiveTitle;
  const canTransition =
    titleValue.trim().length >= 3 && hasMeaningfulContent(content);
  const transitionDisabledTitle = canTransition
    ? undefined
    : "Agrega un título y contenido para continuar";

  const buildPayload = useCallback(() => {
    const v = form.getValues();
    return {
      title: v.title,
      slug: v.slug || slugifyName(v.title || "borrador"),
      excerpt: v.excerpt,
      coverImageUrl: coverUrl ?? "",
      seoTitle: v.seoTitle,
      seoDescription: v.seoDescription,
      content,
      audience,
      categoryIds,
      tagInputs,
    };
  }, [form, coverUrl, content, audience, categoryIds, tagInputs]);

  const lastSavedRef = useRef<string>("");
  const versionRef = useRef(0);
  const userInteractedRef = useRef(false);

  useEffect(() => {
    const flag = () => {
      userInteractedRef.current = true;
    };
    // Defer attaching so the editor's mount-time DOM mutations (BlockNote
    // regenerating its tree, focus syncs, etc.) don't count as interactions.
    const t = window.setTimeout(() => {
      window.addEventListener("keydown", flag, true);
      window.addEventListener("input", flag, true);
      window.addEventListener("paste", flag, true);
      window.addEventListener("pointerdown", flag, true);
    }, 250);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", flag, true);
      window.removeEventListener("input", flag, true);
      window.removeEventListener("paste", flag, true);
      window.removeEventListener("pointerdown", flag, true);
    };
  }, []);

  /**
   * The saved-state baseline, as a string.
   *
   * `effectiveCategoryIds` and `effectiveTagInputs` are freshly mapped arrays
   * on every render, so listing them as effect dependencies re-ran the effect
   * every render and reset `lastSavedRef` — including right after a save had
   * just set it, and after the editor's initial-emit re-baseline. Nothing
   * currently reads it at that moment, because the autosave effect's own
   * dependencies happen to be stable across a save-status render, so the bug
   * is latent rather than live. Comparing a serialized string makes that
   * correctness deliberate instead of accidental: the baseline is rewritten
   * only when the server-provided post actually changes.
   */
  const serverBaseline = useMemo(
    () =>
      JSON.stringify({
        title: effectiveTitle,
        slug: effectiveSlug,
        excerpt: effectiveExcerpt,
        coverImageUrl: effectiveCoverImageUrl ?? "",
        seoTitle: effectiveSeoTitle,
        seoDescription: effectiveSeoDescription,
        content: effectiveContent ?? EMPTY_DOC,
        audience: effectiveAudience,
        categoryIds: effectiveCategoryIds,
        tagInputs: effectiveTagInputs,
      }),
    [
      effectiveTitle,
      effectiveSlug,
      effectiveExcerpt,
      effectiveCoverImageUrl,
      effectiveSeoTitle,
      effectiveSeoDescription,
      effectiveContent,
      effectiveAudience,
      effectiveCategoryIds,
      effectiveTagInputs,
    ],
  );

  useEffect(() => {
    lastSavedRef.current = serverBaseline;
  }, [serverBaseline]);

  useEffect(() => {
    if (!autosaveEligible) return;
    if (!userInteractedRef.current) return;
    const payload = buildPayload();
    const serialized = JSON.stringify(payload);
    if (serialized === lastSavedRef.current) {
      // Back to what is already persisted — usually a typo typed and deleted
      // inside the debounce window. The pending save was cancelled by this
      // effect's own cleanup, so nothing else would clear a stale "Guardando...".
      setSaveStatus((prev) => (prev === "saving" ? "saved" : prev));
      return;
    }

    const version = ++versionRef.current;
    setSaveStatus("saving");

    const timeout = setTimeout(async () => {
      if (versionRef.current !== version) return;
      try {
        const result = await autosaveDraft(post.id, payload);
        if (versionRef.current !== version) return;
        if (result.success) {
          lastSavedRef.current = serialized;
          setSaveStatus("saved");
          setSaveError(undefined);
          if (usesWorkingCopy(post)) setLocalHasWork(true);
        } else {
          setSaveStatus("error");
          setSaveError(result.message);
        }
      } catch (error) {
        if (versionRef.current !== version) return;
        console.error("autosaveDraft", error);
        setSaveStatus("error");
        setSaveError(error instanceof Error ? error.message : String(error));
      }
    }, 1500);

    return () => clearTimeout(timeout);
  }, [
    autosaveEligible,
    post.id,
    buildPayload,
    watchedValues,
    content,
    audience,
    coverUrl,
    categoryIds,
    tagInputs,
  ]);

  async function persistLatest(): Promise<boolean> {
    const payload = buildPayload();
    const res = await autosaveDraft(post.id, payload);
    if (!res.success) {
      toast.error(res.message);
      return false;
    }
    lastSavedRef.current = JSON.stringify(payload);
    setSaveStatus("saved");
    if (usesWorkingCopy(post)) setLocalHasWork(true);
    return true;
  }

  async function handleSubmitForReview() {
    setSubmitting(true);
    try {
      if (!(await persistLatest())) return;
      const res = await submitForReview(post.id);
      if (res.success) {
        toast.success(
          hasWork
            ? "Cambios enviados a revisión"
            : "Artículo enviado a revisión",
        );
        window.location.reload();
      } else {
        toast.error(res.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePublish() {
    setSubmitting(true);
    try {
      if (!(await persistLatest())) return;
      const approving = post.status === "submitted" || workingInReview;
      const res = approving
        ? await approvePost(post.id)
        : post.status === "approved"
          ? await publishApproved(post.id)
          : await directPublish(post.id);
      if (res.success) {
        toast.success(
          approving && !workingInReview
            ? "Artículo aprobado. Ya podés publicarlo o programarlo."
            : "Artículo publicado",
        );
        window.location.reload();
      } else {
        toast.error(res.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelSchedule() {
    setSubmitting(true);
    try {
      const res = await cancelSchedule(post.id);
      if (res.success) {
        toast.success("Programación cancelada");
        window.location.reload();
      } else {
        toast.error(res.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDiscard() {
    setSubmitting(true);
    try {
      const res = await discardWorkingCopy(post.id);
      if (res.success) {
        toast.success("Cambios descartados");
        window.location.reload();
      } else {
        toast.error(res.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const initialEmitSyncedRef = useRef(false);

  useEffect(() => {
    const emit = async () => {
      const blocks = editor.document;
      const serialized = JSON.stringify(blocks);
      if (serialized === lastSerializedRef.current) return;
      lastSerializedRef.current = serialized;
      setContent(blocks);

      if (!initialEmitSyncedRef.current) {
        initialEmitSyncedRef.current = true;
        // BlockNote may regenerate blocks slightly differently from what was
        // persisted. Re-baseline lastSavedRef so the autosave effect doesn't
        // treat this regen as a user edit (which would spuriously flip the
        // working-copy badge on every page load).
        const v = form.getValues();
        lastSavedRef.current = JSON.stringify({
          title: v.title,
          slug: v.slug || slugifyName(v.title || "borrador"),
          excerpt: v.excerpt,
          coverImageUrl: coverUrl ?? "",
          seoTitle: v.seoTitle,
          seoDescription: v.seoDescription,
          content: blocks,
          audience,
          categoryIds,
          tagInputs,
        });
      }
    };
    void emit();
    const off = editor.onChange(() => {
      void emit();
    });
    return () => {
      if (typeof off === "function") off();
    };
    // `coverUrl` / `categoryIds` / `tagInputs` are captured from the initial mount
    // for the baseline-sync above; we intentionally don't rerun on their changes.
    // biome-ignore lint/correctness/useExhaustiveDependencies: see comment
  }, [editor]);

  const showSubmitForReview =
    surface === "portal" &&
    !workingInReview &&
    ((status === "draft" && !hasWork) || hasWork);

  // Approving no longer publishes. A submitted draft becomes `approved` and
  // waits for a publish or a schedule; a staged edit to a live post merges,
  // because there is nothing left to time.
  const showApprove =
    canPublish && ((status === "submitted" && !hasWork) || workingInReview);

  const showDirectPublish =
    canPublish &&
    !showApprove &&
    (status === "draft" ||
      status === "approved" ||
      status === "archived" ||
      (hasWork && !workingInReview));

  const showSchedule = canPublish && status === "approved" && !hasWork;
  const showCancelSchedule = canPublish && status === "scheduled";

  const showRequestChanges =
    canPublish && (workingInReview || (status === "submitted" && !hasWork));

  const showDiscard = hasWork && !workingInReview;
  const showPreview = hasWork && post.slug;

  const submitLabel = hasWork
    ? workingHasRejection
      ? "Re-enviar a revisión"
      : "Enviar cambios a revisión"
    : "Enviar a revisión";

  const publishLabel = showApprove
    ? workingInReview
      ? "Aprobar cambios"
      : "Aprobar"
    : hasWork
      ? "Publicar cambios"
      : status === "approved"
        ? "Publicar ahora"
        : "Publicar";

  const workingBadgeLabel = workingInReview
    ? "Cambios en revisión"
    : workingHasRejection
      ? "Cambios con observaciones"
      : "Cambios sin publicar";

  const workingBadgeClass = workingInReview
    ? "border-sky-200 bg-sky-50 text-sky-700"
    : workingHasRejection
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => e.preventDefault()}
        className="flex flex-col gap-4 pb-28 md:pb-24"
      >
        <div className="sticky top-16 md:top-20 z-40 -mx-4 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/70">
          <div className="px-4 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button asChild variant="ghost" size="icon" aria-label="Volver">
                  <Link
                    href={
                      surface === "dashboard"
                        ? "/dashboard/blog"
                        : "/portal/blog"
                    }
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                </Button>
                <PostStatusBadge status={status} />
                {(workingInReview || workingHasRejection) && (
                  <span
                    className={`hidden md:inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${workingBadgeClass}`}
                  >
                    {workingBadgeLabel}
                  </span>
                )}
                {autosaveEligible && (
                  <SaveIndicator status={saveStatus} errorMessage={saveError} />
                )}
              </div>

              {/* Desktop button bar */}
              <div className="hidden md:flex flex-wrap gap-2">
                {showPreview && (
                  <Button asChild variant="outline">
                    <Link
                      href={`/blog/${post.slug}?preview=working`}
                      target="_blank"
                    >
                      <Eye className="mr-1 h-4 w-4" />
                      Vista previa
                    </Link>
                  </Button>
                )}
                {showDiscard && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={submitting}
                    onClick={() => setDiscardOpen(true)}
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    Descartar cambios
                  </Button>
                )}
                {showRequestChanges && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={submitting}
                    onClick={() => setRequestChangesOpen(true)}
                  >
                    <MessageSquareWarning className="mr-1 h-4 w-4" />
                    Solicitar cambios
                  </Button>
                )}
                {showSubmitForReview && (
                  <Button
                    type="button"
                    className="bg-amber-600 hover:bg-amber-700"
                    onClick={handleSubmitForReview}
                    disabled={submitting || editorReadOnly || !canTransition}
                    title={transitionDisabledTitle}
                  >
                    {submitLabel}
                  </Button>
                )}
                {showSchedule && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setScheduleOpen(true)}
                    disabled={submitting || !canTransition}
                    title={transitionDisabledTitle}
                  >
                    <CalendarClock className="mr-1 size-4" />
                    Programar
                  </Button>
                )}
                {showCancelSchedule && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancelSchedule}
                    disabled={submitting}
                  >
                    Cancelar programación
                  </Button>
                )}
                {(showApprove || showDirectPublish) && (
                  <Button
                    type="button"
                    className="bg-primary hover:bg-primary/90"
                    onClick={handlePublish}
                    disabled={submitting || !canTransition}
                    title={transitionDisabledTitle}
                  >
                    {publishLabel}
                  </Button>
                )}
              </div>

              {/* Mobile button bar: one primary CTA + overflow menu */}
              <div className="flex items-center gap-1 md:hidden">
                {showSubmitForReview && (
                  <Button
                    type="button"
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700"
                    onClick={handleSubmitForReview}
                    disabled={submitting || editorReadOnly || !canTransition}
                    title={transitionDisabledTitle}
                  >
                    {submitLabel}
                  </Button>
                )}
                {(showApprove || showDirectPublish) && (
                  <Button
                    type="button"
                    size="sm"
                    className="bg-primary hover:bg-primary/90"
                    onClick={handlePublish}
                    disabled={submitting || !canTransition}
                    title={transitionDisabledTitle}
                  >
                    {publishLabel}
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Más acciones"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {showPreview && (
                      <DropdownMenuItem asChild>
                        <Link
                          href={`/blog/${post.slug}?preview=working`}
                          target="_blank"
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          Vista previa
                        </Link>
                      </DropdownMenuItem>
                    )}
                    {showDiscard && (
                      <DropdownMenuItem onSelect={() => setDiscardOpen(true)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Descartar cambios
                      </DropdownMenuItem>
                    )}
                    {showRequestChanges && (
                      <DropdownMenuItem
                        onSelect={() => setRequestChangesOpen(true)}
                      >
                        <MessageSquareWarning className="mr-2 h-4 w-4" />
                        Solicitar cambios
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
                      <Settings className="mr-2 h-4 w-4" />
                      Ajustes
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
          {/* Desktop toolbar: stacks below the header on >=md */}
          <div className="hidden md:block">
            <EditorTopToolbar editor={editor} readOnly={editorReadOnly} />
          </div>
        </div>

        {workingHasRejection ? (
          <ReviewerNotesBanner
            status={post.status}
            notes={post.workingReviewerNotes}
            scope="working"
          />
        ) : (
          <ReviewerNotesBanner
            status={post.status}
            notes={post.reviewerNotes}
          />
        )}

        <div className="mx-auto w-full max-w-3xl space-y-4 pt-2">
          <CoverImageToggle
            value={coverUrl}
            onChange={setCoverUrl}
            disabled={editorReadOnly}
          />

          <TitleTextarea
            register={form.register("title")}
            value={titleValue}
            disabled={editorReadOnly}
          />
          {form.formState.errors.title && (
            <p className="px-3 text-sm text-destructive md:px-[54px]">
              {form.formState.errors.title.message as string}
            </p>
          )}

          <PostEditor editor={editor} readOnly={editorReadOnly} />
        </div>

        <PostSettingsSheet
          formControl={form.control}
          categoryOptions={categoryOptions}
          categoryIds={categoryIds}
          onCategoryIdsChange={setCategoryIds}
          tagInputs={tagInputs}
          onTagInputsChange={setTagInputs}
          audience={audience}
          onAudienceChange={setAudience}
          slugPreview={post.slug}
          postId={post.id}
          shareLink={shareLink}
          commentsEnabled={post.commentsEnabled}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
        />

        <ScheduleDialog
          postId={post.id}
          open={scheduleOpen}
          onOpenChange={setScheduleOpen}
          currentScheduledAt={post.scheduledAt}
        />

        <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                ¿Descartar los cambios sin publicar?
              </AlertDialogTitle>
              <AlertDialogDescription>
                El artículo volverá a su versión actual publicada. Esta acción
                no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={submitting}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDiscard}
                disabled={submitting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Descartar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <RequestChangesDialog
          postId={post.id}
          open={requestChangesOpen}
          onOpenChange={setRequestChangesOpen}
          onDone={() => window.location.reload()}
        />

        {/* Mobile bottom toolbar — fixed above the on-screen keyboard */}
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
          <EditorTopToolbar editor={editor} readOnly={editorReadOnly} />
        </div>
      </form>
    </Form>
  );
}
