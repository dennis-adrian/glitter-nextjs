"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Loader2,
  Save,
  Settings,
} from "lucide-react";

import CouponBookEditorPanel from "@/app/components/festivals/festival_activities/coupon-book-editor-panel";
import CouponBookPrintPage from "@/app/components/festivals/festival_activities/coupon-book-print-page";
import {
  COUPON_BOOK_PAGE_HEIGHT_CM,
  COUPON_BOOK_PAGE_WIDTH_CM,
  CouponBookVariant,
} from "@/app/lib/festival_activites/coupon-book-builder";
import {
  buildInitialCouponBookDraft,
  CouponBookDraft,
  CouponBookReconciliation,
  countCouponVisibility,
  countEmptySlotsOnPage,
  draftEntryToCouponBookEntry,
  draftPageToCouponBookPage,
  getDraftBookPages,
  getEffectiveLayoutForCoupon,
  mergeDraftWithSource,
  moveCouponBetweenPages,
  reflowDraftPages,
  resetDraftToDefaults,
  restoreDraftCouponFromSource,
  setParticipantInclusionMode,
  updateDraftCouponEntry,
  updateVariantCouponCount,
  countAssignedParticipantsForBook,
} from "@/app/lib/festival_activites/coupon-book-draft";
import {
  clearStoredCouponBookEditorState,
  loadStoredCouponBookEditorState,
  saveStoredCouponBookEditorState,
} from "@/app/lib/festival_activites/coupon-book-draft-storage";
import { fitCouponText } from "@/app/lib/festival_activites/fit-coupon-text";
import { Button } from "@/app/components/ui/button";
import { Label } from "@/app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Sheet, SheetContent, SheetTitle } from "@/app/components/ui/sheet";

type CouponBookPreviewClientProps = {
  festivalId: number;
  activityId: number;
  activityName: string;
  variants: CouponBookVariant[];
  initialSavedDraft: CouponBookDraft | null;
  savedRevision: number | null;
  savedUpdatedAt: Date | null;
  reconciliation: CouponBookReconciliation | null;
  backUrl: string;
};

export default function CouponBookPreviewClient({
  festivalId,
  activityId,
  activityName,
  variants,
  initialSavedDraft,
  savedRevision,
  savedUpdatedAt,
  reconciliation,
  backUrl,
}: CouponBookPreviewClientProps) {
  const sourceDraft = useMemo(
    () =>
      buildInitialCouponBookDraft({
        festivalId,
        activityId,
        variants,
      }),
    [activityId, festivalId, variants],
  );

  const baselineDraft = initialSavedDraft ?? sourceDraft;
  const [draft, setDraft] = useState<CouponBookDraft>(baselineDraft);
  const [savedBaseline, setSavedBaseline] = useState<CouponBookDraft | null>(
    initialSavedDraft,
  );
  const [savedRevisionState, setSavedRevisionState] = useState<number | null>(
    savedRevision,
  );
  const [storageHydrated, setStorageHydrated] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState<string>(
    baselineDraft.books[0]?.id ?? "",
  );
  const [selectedPageIndex, setSelectedPageIndex] = useState(0);
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error" | "conflict"
  >("idle");
  const [exportState, setExportState] = useState<
    "idle" | "loading" | "error"
  >("idle");

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pageFrameRef = useRef<HTMLDivElement | null>(null);
  const latestDraftRef = useRef<CouponBookDraft>(draft);

  useEffect(() => {
    latestDraftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    const stored = loadStoredCouponBookEditorState(
      festivalId,
      activityId,
      baselineDraft,
      { serverUpdatedAt: savedUpdatedAt },
    );
    latestDraftRef.current = stored.draft;
    setDraft(stored.draft);
    if (stored.ui?.selectedBookId) setSelectedBookId(stored.ui.selectedBookId);
    if (stored.ui?.selectedCouponId) {
      setSelectedCouponId(stored.ui.selectedCouponId);
    }
    setStorageHydrated(true);
  }, [activityId, baselineDraft, festivalId, savedUpdatedAt]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    setEditorOpen(window.innerWidth >= 1024);
  }, []);

  useEffect(() => {
    if (!storageHydrated) return;
    saveStoredCouponBookEditorState(festivalId, activityId, {
      draft,
      ui: {
        selectedBookId,
        selectedCouponId: selectedCouponId ?? undefined,
      },
    });
  }, [
    activityId,
    draft,
    festivalId,
    selectedBookId,
    selectedCouponId,
    storageHydrated,
  ]);

  const selectedBook = useMemo(
    () =>
      draft.books.find((book) => book.id === selectedBookId) ?? draft.books[0],
    [draft.books, selectedBookId],
  );

  const pages = useMemo(
    () => (selectedBook ? getDraftBookPages(draft, selectedBook.id) : []),
    [draft, selectedBook],
  );

  useEffect(() => {
    if (selectedPageIndex >= pages.length) {
      setSelectedPageIndex(Math.max(0, pages.length - 1));
    }
  }, [pages.length, selectedPageIndex]);

  const selectedPage = pages[selectedPageIndex] ?? pages[0] ?? null;
  const selectedCoupon = selectedCouponId
    ? (draft.entries[selectedCouponId] ?? null)
    : null;

  const couponBookPage = useMemo(
    () =>
      selectedPage ? draftPageToCouponBookPage(draft, selectedPage) : null,
    [draft, selectedPage],
  );

  const visibility = useMemo(() => countCouponVisibility(draft), [draft]);
  const emptySlots = selectedPage
    ? countEmptySlotsOnPage(draft, selectedPage)
    : 0;

  const isDirty = useMemo(() => {
    const baseline = savedBaseline ?? sourceDraft;
    return JSON.stringify(draft) !== JSON.stringify(baseline);
  }, [draft, savedBaseline, sourceDraft]);

  const moveTargetPages = useMemo(() => {
    if (!selectedCoupon || selectedCoupon.type !== "participant") return [];
    return draft.books.flatMap((book) =>
      getDraftBookPages(draft, book.id).map((page) => ({
        id: page.id,
        label: `${book.label} · Página ${page.pageNumber}`,
      })),
    );
  }, [draft, selectedCoupon]);

  useEffect(() => {
    const updateScale = () => {
      const viewportEl = viewportRef.current;
      const pageEl = pageFrameRef.current;
      if (!viewportEl || !pageEl) return;
      const viewportWidth = viewportEl.clientWidth;
      if (viewportWidth <= 0) return;
      const naturalWidth = pageEl.offsetWidth;
      if (naturalWidth <= 0) return;
      const horizontalPadding = 12;
      const nextScale = Math.min(
        1,
        (viewportWidth - horizontalPadding * 2) / naturalWidth,
      );
      setPreviewScale(
        Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1,
      );
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    if (viewportRef.current) observer.observe(viewportRef.current);
    window.addEventListener("resize", updateScale);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, [selectedPageIndex, selectedBookId, editorOpen]);

  useEffect(() => {
    const frame = pageFrameRef.current;
    if (!frame) return;
    let rafB = 0;
    const rafA = requestAnimationFrame(() => {
      rafB = requestAnimationFrame(() => {
        fitCouponText(frame);
      });
    });
    return () => {
      cancelAnimationFrame(rafA);
      if (rafB) cancelAnimationFrame(rafB);
    };
  }, [
    selectedPageIndex,
    selectedBookId,
    previewScale,
    draft,
    selectedCouponId,
  ]);

  const applyDraft = useCallback((next: CouponBookDraft) => {
    latestDraftRef.current = next;
    setDraft(next);
    setSaveState("idle");
  }, []);

  const handleDraftChange = useCallback(
    (next: CouponBookDraft) => {
      const inclusionChanged =
        next.globalSettings.participantInclusionMode !==
        draft.globalSettings.participantInclusionMode;
      const perPageChanged =
        next.globalSettings.dynamicCouponsPerPage !==
        draft.globalSettings.dynamicCouponsPerPage;

      let resolved = next;
      if (inclusionChanged) {
        resolved = setParticipantInclusionMode(
          resolved,
          next.globalSettings.participantInclusionMode,
        );
      }
      if (perPageChanged) {
        resolved = reflowDraftPages(
          resolved,
          next.globalSettings.dynamicCouponsPerPage,
        );
      }
      applyDraft(resolved);
    },
    [applyDraft, draft.globalSettings],
  );

  const handleSave = async () => {
    const draftToSave = draft;
    setSaveState("saving");
    try {
      const response = await fetch(
        `/api/festival_activities/${activityId}/couponbook/config`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            draft: draftToSave,
            expectedRevision: savedRevisionState,
          }),
        },
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        revision?: number;
        error?: string;
        currentRevision?: number;
      };
      if (response.status === 409) {
        if (payload.currentRevision) {
          setSavedRevisionState(payload.currentRevision);
        }
        setSaveState("conflict");
        return;
      }
      if (!response.ok || !payload.ok || !payload.revision) {
        setSaveState("error");
        return;
      }
      const nextDraft = {
        ...draftToSave,
        savedRevision: payload.revision,
        updatedAt: new Date().toISOString(),
      };
      setSavedBaseline(nextDraft);
      setSavedRevisionState(payload.revision);
      const hasNewerDraft = latestDraftRef.current !== draftToSave;
      setDraft((current) => {
        if (current === draftToSave) {
          latestDraftRef.current = nextDraft;
          return nextDraft;
        }
        const currentWithRevision = {
          ...current,
          savedRevision: payload.revision,
        };
        latestDraftRef.current = currentWithRevision;
        return currentWithRevision;
      });
      setSaveState(hasNewerDraft ? "idle" : "saved");
    } catch {
      setSaveState("error");
    }
  };

  const handleReset = () => {
    clearStoredCouponBookEditorState(festivalId, activityId);
    const resetTarget = resetDraftToDefaults({
      draft,
      variants,
      useSavedRevision: Boolean(savedBaseline),
    });
    const nextDraft = savedBaseline
      ? { ...savedBaseline, savedRevision: savedRevisionState }
      : resetTarget;
    latestDraftRef.current = nextDraft;
    setDraft(nextDraft);
    setSelectedPageIndex(0);
    setSelectedCouponId(null);
    setSaveState("idle");
  };

  const handleMergeFromSource = () => {
    const merged = mergeDraftWithSource(draft, sourceDraft, variants);
    applyDraft(merged);
    setSelectedPageIndex(0);
  };

  const exportDraft = async (
    scope: { type: "all" } | { type: "book"; bookId: string },
  ) => {
    setExportState("loading");
    try {
      const response = await fetch(
        `/api/festival_activities/${activityId}/couponbook/export`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft, exportScope: scope }),
        },
      );
      if (!response.ok) {
        setExportState("error");
        return;
      }
      const blob = await response.blob();
      const suffix =
        scope.type === "all" ? "todas-las-variantes" : `libro-${scope.bookId}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `cuponera-${activityId}-${suffix}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
      setExportState("idle");
    } catch {
      setExportState("error");
    }
  };

  if (draft.books.length === 0) {
    return (
      <div className="container p-6">
        <div className="rounded-md border p-4 text-sm text-muted-foreground">
          No hay variantes disponibles para generar cuponera.
        </div>
      </div>
    );
  }

  const headerDynamicCouponId = selectedPage?.slotCouponIds[0] ?? null;
  const bodyCouponIds = selectedPage?.slotCouponIds.slice(1) ?? [];
  const courtesyEntry = draft.entries[draft.courtesyCouponId];

  const configPanel = (
    <CouponBookEditorPanel
      draft={draft}
      selectedCoupon={selectedCoupon}
      selectedCouponId={selectedCouponId}
      includedCount={visibility.included}
      hiddenCount={visibility.hidden}
      pageCount={pages.length}
      emptySlots={emptySlots}
      onReset={handleReset}
      onDraftChange={handleDraftChange}
      onUpdateCoupon={(couponId, patch) =>
        applyDraft(updateDraftCouponEntry(draft, couponId, patch))
      }
      onRestoreCoupon={(couponId) =>
        applyDraft(restoreDraftCouponFromSource(draft, couponId))
      }
      onClearCouponOverride={(couponId) =>
        applyDraft(
          updateDraftCouponEntry(draft, couponId, { layoutOverride: null }),
        )
      }
      onMoveCoupon={(targetPageId) => {
        if (!selectedCouponId) return;
        applyDraft(
          moveCouponBetweenPages({
            draft,
            couponId: selectedCouponId,
            targetPageId,
          }),
        );
      }}
      onUpdateVariantCouponCount={(bookId, variantCouponCount) =>
        applyDraft(updateVariantCouponCount(draft, bookId, variantCouponCount))
      }
      getAssignedParticipantCount={countAssignedParticipantsForBook}
      moveTargetPages={moveTargetPages}
    />
  );

  return (
    <div className="container flex flex-col">
      <header className="flex items-center gap-3 px-4 py-3 border-b flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Link
            href={backUrl}
            className="shrink-0 rounded-sm p-1 hover:bg-muted transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="sr-only">Volver</span>
          </Link>
          <div className="min-w-0">
            <h1 className="font-bold text-base md:text-lg leading-tight truncate">
              Preview Couponbook
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              {activityName}
              {isDirty ? " · Cambios sin guardar" : null}
              {saveState === "saved" ? " · Guardado" : null}
              {saveState === "error" ? " · Error al guardar" : null}
              {saveState === "conflict"
                ? " · Conflicto de versión guardada"
                : null}
              {exportState === "error" ? " · Error al exportar" : null}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            disabled={!isDirty || saveState === "saving"}
            onClick={handleSave}
          >
            {saveState === "saving" ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            Guardar
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={exportState === "loading" || !selectedBook}
            onClick={() =>
              selectedBook &&
              exportDraft({ type: "book", bookId: selectedBook.id })
            }
          >
            {exportState === "loading" ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-1.5" />
            )}
            <span className="hidden sm:inline">Descargar variante</span>
            <span className="sm:hidden">Variante</span>
          </Button>
          <Button
            size="sm"
            disabled={exportState === "loading"}
            onClick={() => exportDraft({ type: "all" })}
          >
            {exportState === "loading" ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-1.5" />
            )}
            <span className="hidden sm:inline">Descargar todas</span>
            <span className="sm:hidden">Todas</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditorOpen((value) => !value)}
          >
            <Settings className="h-4 w-4 mr-1.5" />
            Editor
          </Button>
        </div>
      </header>

      <div className="flex items-start min-h-0">
        <div className="flex-1 min-w-0 p-4 space-y-4">
          {reconciliation &&
          (reconciliation.newParticipationIds.length > 0 ||
            reconciliation.removedParticipationIds.length > 0 ||
            reconciliation.changedParticipationIds.length > 0) ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 space-y-2">
              <p>
                Los datos de participantes cambiaron desde la última configuración
                guardada: {reconciliation.newParticipationIds.length} nuevo(s),{" "}
                {reconciliation.removedParticipationIds.length} removido(s),{" "}
                {reconciliation.changedParticipationIds.length} modificado(s).
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs border-amber-400 bg-white hover:bg-amber-100"
                onClick={handleMergeFromSource}
              >
                Actualizar participantes desde fuente
              </Button>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="book-select">Variante</Label>
            <Select
              value={selectedBook?.id ?? ""}
              onValueChange={(value) => {
                setSelectedBookId(value);
                setSelectedPageIndex(0);
              }}
            >
              <SelectTrigger id="book-select" className="w-full">
                <SelectValue placeholder="Selecciona una variante" />
              </SelectTrigger>
              <SelectContent>
                {draft.books.map((book) => (
                  <SelectItem key={book.id} value={book.id}>
                    {book.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground space-y-0.5 pt-0.5">
              <div className="flex justify-between">
                <span>Cupones incluidos:</span>
                <span className="font-medium text-foreground">
                  {visibility.included}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Cupones en variante:</span>
                <span className="font-medium text-foreground">
                  {selectedBook?.variantCouponCount ?? 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Páginas:</span>
                <span className="font-medium text-foreground">
                  {pages.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Cupones en página:</span>
                <span className="font-medium text-foreground">
                  {selectedPage?.slotCouponIds.length ?? 0} (+ 1 cortesía)
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Eye className="h-4 w-4 shrink-0" />
            <span className="ml-1">
              Página {selectedPageIndex + 1} de {pages.length}
            </span>
            {pages.length > 1 ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 ml-1"
                  aria-label="Página anterior"
                  disabled={selectedPageIndex === 0}
                  onClick={() => setSelectedPageIndex((index) => index - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Página siguiente"
                  disabled={selectedPageIndex >= pages.length - 1}
                  onClick={() => setSelectedPageIndex((index) => index + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            ) : null}
          </div>

          <div className="rounded-md border bg-muted/20 p-3">
            <div ref={viewportRef} className="w-full overflow-auto">
              <div className="flex justify-center min-w-max">
                <div
                  style={{
                    width: `calc(${COUPON_BOOK_PAGE_WIDTH_CM}cm * ${previewScale})`,
                    height: `calc(${COUPON_BOOK_PAGE_HEIGHT_CM}cm * ${previewScale})`,
                  }}
                >
                  <div
                    ref={pageFrameRef}
                    style={{
                      width: `${COUPON_BOOK_PAGE_WIDTH_CM}cm`,
                      height: `${COUPON_BOOK_PAGE_HEIGHT_CM}cm`,
                      transform: `scale(${previewScale})`,
                      transformOrigin: "top left",
                    }}
                  >
                    {couponBookPage && courtesyEntry ? (
                      <CouponBookPrintPage
                        page={couponBookPage}
                        courtesyEntry={draftEntryToCouponBookEntry(
                          courtesyEntry,
                        )}
                        courtesyCouponId={draft.courtesyCouponId}
                        headerDynamicCouponId={headerDynamicCouponId}
                        bodyCouponIds={bodyCouponIds}
                        textLayoutConfig={draft.globalSettings.globalLayout}
                        resolveLayout={(couponId) =>
                          getEffectiveLayoutForCoupon(draft, couponId)
                        }
                        headerImageUrl={selectedBook?.headerImageUrl ?? null}
                        headerImageScalePct={
                          draft.globalSettings.globalLayout.headerImageScalePct
                        }
                        interactive
                        selectedCouponId={selectedCouponId}
                        onSelectCoupon={setSelectedCouponId}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {editorOpen ? (
          <aside className="hidden lg:flex flex-col w-[320px] shrink-0 border-l sticky top-4 h-[calc(100vh-6rem)] overflow-hidden">
            {configPanel}
          </aside>
        ) : null}
      </div>

      <Sheet open={isMobile && editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent
          side="right"
          className="w-[320px] p-0 flex flex-col lg:hidden"
        >
          <SheetTitle className="sr-only">Configuración</SheetTitle>
          {configPanel}
        </SheetContent>
      </Sheet>
    </div>
  );
}
