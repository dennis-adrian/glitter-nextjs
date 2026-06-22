"use client";

import {
  COUPON_BOOK_PAGE_HEIGHT_CM,
  COUPON_BOOK_PAGE_WIDTH_CM,
  CouponTextBoxConfig,
  CouponTextLayoutConfig,
  DEFAULT_COUPON_TEXT_LAYOUT_CONFIG,
} from "@/app/lib/festival_activites/coupon-book-builder";
import {
  CouponBookDraft,
  CouponLayoutOverride,
  DraftCouponEntry,
  MAX_DYNAMIC_COUPONS_PER_PAGE,
  MIN_DYNAMIC_COUPONS_PER_PAGE,
  ParticipantInclusionMode,
  getEffectiveLayoutForCoupon,
} from "@/app/lib/festival_activites/coupon-book-draft";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { RotateCcw } from "lucide-react";

type BoxKey = "nameBox" | "highlightBox" | "descriptionBox" | "validityBox";
type BoxNumericField = "xPct" | "yPct" | "widthPct" | "heightPct";

const BOX_KEYS: { key: BoxKey; label: string }[] = [
  { key: "nameBox", label: "Nombre" },
  { key: "highlightBox", label: "Highlight" },
  { key: "descriptionBox", label: "Descripción" },
  { key: "validityBox", label: "Validez" },
];

type CouponBookEditorPanelProps = {
  draft: CouponBookDraft;
  selectedCoupon: DraftCouponEntry | null;
  selectedCouponId: string | null;
  includedCount: number;
  hiddenCount: number;
  pageCount: number;
  emptySlots: number;
  onReset: () => void;
  onDraftChange: (next: CouponBookDraft) => void;
  onUpdateCoupon: (
    couponId: string,
    patch: Partial<DraftCouponEntry>,
  ) => void;
  onRestoreCoupon: (couponId: string) => void;
  onClearCouponOverride: (couponId: string) => void;
  onMoveCoupon: (targetPageId: string) => void;
  moveTargetPages: Array<{ id: string; label: string }>;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function setBoxValueOnLayout(
  layout: CouponTextLayoutConfig,
  boxKey: BoxKey,
  field: BoxNumericField,
  value: string,
  min: number,
  max: number,
): CouponTextLayoutConfig {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return layout;
  const current = layout[boxKey];
  const next: CouponTextBoxConfig = { ...current };

  if (field === "xPct") {
    const maxX = Math.min(max, 100 - current.widthPct);
    next.xPct = clamp(parsed, min, maxX);
    next.widthPct = clamp(current.widthPct, 10, 100 - next.xPct);
  } else if (field === "widthPct") {
    const maxWidth = Math.min(max, 100 - current.xPct);
    next.widthPct = clamp(parsed, min, maxWidth);
    next.xPct = clamp(current.xPct, 0, 100 - next.widthPct);
  } else if (field === "yPct") {
    const maxY = Math.min(max, 100 - current.heightPct);
    next.yPct = clamp(parsed, min, maxY);
    next.heightPct = clamp(current.heightPct, 5, 100 - next.yPct);
  } else if (field === "heightPct") {
    const maxHeight = Math.min(max, 100 - current.yPct);
    next.heightPct = clamp(parsed, min, maxHeight);
    next.yPct = clamp(current.yPct, 0, 100 - next.heightPct);
  }

  return { ...layout, [boxKey]: next };
}

function updateOverrideBox(
  override: CouponLayoutOverride | null | undefined,
  boxKey: BoxKey,
  field: BoxNumericField,
  value: string,
): CouponLayoutOverride {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return override ?? {};
  const current = override?.[boxKey] ?? {};
  return {
    ...override,
    [boxKey]: { ...current, [field]: parsed },
  };
}

export default function CouponBookEditorPanel({
  draft,
  selectedCoupon,
  selectedCouponId,
  includedCount,
  hiddenCount,
  pageCount,
  emptySlots,
  onReset,
  onDraftChange,
  onUpdateCoupon,
  onRestoreCoupon,
  onClearCouponOverride,
  onMoveCoupon,
  moveTargetPages,
}: CouponBookEditorPanelProps) {
  const pdfCanvas = draft.globalSettings.pdfCanvas;
  const textLayoutConfig = draft.globalSettings.globalLayout;
  const effectiveLayout = selectedCouponId
    ? getEffectiveLayoutForCoupon(draft, selectedCouponId)
    : textLayoutConfig;
  const hasOverride = Boolean(selectedCoupon?.layoutOverride);

  const effectivePdfCanvas = {
    widthCm:
      pdfCanvas.orientation === "landscape"
        ? Math.max(pdfCanvas.widthCm, pdfCanvas.heightCm)
        : Math.min(pdfCanvas.widthCm, pdfCanvas.heightCm),
    heightCm:
      pdfCanvas.orientation === "landscape"
        ? Math.min(pdfCanvas.widthCm, pdfCanvas.heightCm)
        : Math.max(pdfCanvas.widthCm, pdfCanvas.heightCm),
  };
  const estimatedPerSheet = {
    cols: Math.max(
      1,
      Math.floor(effectivePdfCanvas.widthCm / COUPON_BOOK_PAGE_WIDTH_CM),
    ),
    rows: Math.max(
      1,
      Math.floor(effectivePdfCanvas.heightCm / COUPON_BOOK_PAGE_HEIGHT_CM),
    ),
  };

  const patchGlobalLayout = (nextLayout: CouponTextLayoutConfig) => {
    onDraftChange({
      ...draft,
      updatedAt: new Date().toISOString(),
      globalSettings: {
        ...draft.globalSettings,
        globalLayout: nextLayout,
      },
    });
  };

  const patchGlobalRoot = (
    key: "leftColumnWidthPct" | "standFontSizeMm" | "sectorFontSizeMm" | "headerImageScalePct",
    value: string,
    min: number,
    max: number,
  ) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    patchGlobalLayout({
      ...textLayoutConfig,
      [key]: clamp(parsed, min, max),
    });
  };

  const patchGlobalBox = (
    boxKey: BoxKey,
    field: BoxNumericField,
    value: string,
    min: number,
    max: number,
  ) => {
    patchGlobalLayout(
      setBoxValueOnLayout(textLayoutConfig, boxKey, field, value, min, max),
    );
  };

  const patchCouponOverrideRoot = (
    key: "leftColumnWidthPct" | "standFontSizeMm" | "sectorFontSizeMm",
    value: string,
    min: number,
    max: number,
  ) => {
    if (!selectedCouponId) return;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    onUpdateCoupon(selectedCouponId, {
      layoutOverride: {
        ...selectedCoupon?.layoutOverride,
        [key]: clamp(parsed, min, max),
      },
    });
  };

  const patchCouponOverrideBox = (
    boxKey: BoxKey,
    field: BoxNumericField,
    value: string,
  ) => {
    if (!selectedCouponId) return;
    onUpdateCoupon(selectedCouponId, {
      layoutOverride: updateOverrideBox(
        selectedCoupon?.layoutOverride,
        boxKey,
        field,
        value,
      ),
    });
  };

  const layoutFieldsSource = hasOverride ? effectiveLayout : textLayoutConfig;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <p className="font-semibold text-sm">Configuración</p>
        <Button variant="outline" size="sm" onClick={onReset}>
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          Reset
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-8 space-y-6">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Filtro de participantes
          </p>
          <Select
            value={draft.globalSettings.participantInclusionMode}
            onValueChange={(value: ParticipantInclusionMode) =>
              onDraftChange({
                ...draft,
                updatedAt: new Date().toISOString(),
                globalSettings: {
                  ...draft.globalSettings,
                  participantInclusionMode: value,
                },
              })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="approved_only">Solo aprobados</SelectItem>
              <SelectItem value="approved_and_pending">
                Aprobados + pendientes
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Incluidos: {includedCount} · Ocultos: {hiddenCount}
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Página de cuponera
          </p>
          <div className="space-y-1">
            <Label htmlFor="dynamic-coupons-per-page" className="text-xs">
              Cupones dinámicos por página
            </Label>
            <Input
              id="dynamic-coupons-per-page"
              type="number"
              min={MIN_DYNAMIC_COUPONS_PER_PAGE}
              max={MAX_DYNAMIC_COUPONS_PER_PAGE}
              value={draft.globalSettings.dynamicCouponsPerPage}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (!Number.isFinite(parsed)) return;
                onDraftChange({
                  ...draft,
                  updatedAt: new Date().toISOString(),
                  globalSettings: {
                    ...draft.globalSettings,
                    dynamicCouponsPerPage: clamp(
                      parsed,
                      MIN_DYNAMIC_COUPONS_PER_PAGE,
                      MAX_DYNAMIC_COUPONS_PER_PAGE,
                    ),
                  },
                });
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Páginas: {pageCount} · Slots vacíos: {emptySlots} (+ 1 cortesía fija)
          </p>
        </div>

        {selectedCoupon ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Contenido del cupón
            </p>
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs">Nombre</Label>
                <Input
                  value={selectedCoupon.participantName}
                  onChange={(event) =>
                    onUpdateCoupon(selectedCoupon.id, {
                      participantName: event.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Stand(s)</Label>
                <Input
                  value={selectedCoupon.standLabels.join(", ")}
                  onChange={(event) =>
                    onUpdateCoupon(selectedCoupon.id, {
                      standLabels: event.target.value
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Sector</Label>
                <Input
                  value={selectedCoupon.sectorName ?? ""}
                  onChange={(event) =>
                    onUpdateCoupon(selectedCoupon.id, {
                      sectorName: event.target.value || null,
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Highlight</Label>
                <Input
                  value={selectedCoupon.promoHighlight}
                  onChange={(event) =>
                    onUpdateCoupon(selectedCoupon.id, {
                      promoHighlight: event.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Descripción</Label>
                <Input
                  value={selectedCoupon.promoDescription}
                  onChange={(event) =>
                    onUpdateCoupon(selectedCoupon.id, {
                      promoDescription: event.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Validez / condiciones</Label>
                <Input
                  value={selectedCoupon.promoConditions ?? ""}
                  onChange={(event) =>
                    onUpdateCoupon(selectedCoupon.id, {
                      promoConditions: event.target.value || null,
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Imagen (URL)</Label>
                <Input
                  value={selectedCoupon.imageUrl ?? ""}
                  onChange={(event) =>
                    onUpdateCoupon(selectedCoupon.id, {
                      imageUrl: event.target.value || null,
                    })
                  }
                />
              </div>
            </div>
            {selectedCoupon.type === "participant" ? (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRestoreCoupon(selectedCoupon.id)}
                >
                  Restaurar origen
                </Button>
              </div>
            ) : null}
            {moveTargetPages.length > 0 &&
            selectedCoupon.type === "participant" ? (
              <div className="space-y-1">
                <Label className="text-xs">Mover a página</Label>
                <Select onValueChange={(pageId) => onMoveCoupon(pageId)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar página destino" />
                  </SelectTrigger>
                  <SelectContent>
                    {moveTargetPages.map((page) => (
                      <SelectItem key={page.id} value={page.id}>
                        {page.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Selecciona un cupón en la vista previa para editar su contenido.
          </p>
        )}

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Configuración de PDF
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Ancho (cm)</Label>
              <Input
                type="number"
                step="0.01"
                min="10"
                max="200"
                value={pdfCanvas.widthCm}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (!Number.isFinite(parsed)) return;
                  onDraftChange({
                    ...draft,
                    updatedAt: new Date().toISOString(),
                    globalSettings: {
                      ...draft.globalSettings,
                      pdfCanvas: {
                        ...pdfCanvas,
                        widthCm: clamp(parsed, 10, 200),
                      },
                    },
                  });
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Alto (cm)</Label>
              <Input
                type="number"
                step="0.01"
                min="10"
                max="200"
                value={pdfCanvas.heightCm}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (!Number.isFinite(parsed)) return;
                  onDraftChange({
                    ...draft,
                    updatedAt: new Date().toISOString(),
                    globalSettings: {
                      ...draft.globalSettings,
                      pdfCanvas: {
                        ...pdfCanvas,
                        heightCm: clamp(parsed, 10, 200),
                      },
                    },
                  });
                }}
              />
            </div>
          </div>
          <Select
            value={pdfCanvas.orientation}
            onValueChange={(value) =>
              onDraftChange({
                ...draft,
                updatedAt: new Date().toISOString(),
                globalSettings: {
                  ...draft.globalSettings,
                  pdfCanvas: {
                    ...pdfCanvas,
                    orientation: value === "portrait" ? "portrait" : "landscape",
                  },
                },
              })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="landscape">Horizontal</SelectItem>
              <SelectItem value="portrait">Vertical</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {estimatedPerSheet.cols * estimatedPerSheet.rows} cuponera(s) por
            hoja ({estimatedPerSheet.cols} × {estimatedPerSheet.rows})
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Layout {hasOverride ? "del cupón seleccionado" : "global"}
            </p>
            {hasOverride && selectedCouponId ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onClearCouponOverride(selectedCouponId)}
              >
                Usar global
              </Button>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Columna Izquierda (%)</Label>
            <Input
              type="number"
              value={layoutFieldsSource.leftColumnWidthPct}
              onChange={(event) =>
                hasOverride
                  ? patchCouponOverrideRoot(
                      "leftColumnWidthPct",
                      event.target.value,
                      20,
                      60,
                    )
                  : patchGlobalRoot(
                      "leftColumnWidthPct",
                      event.target.value,
                      20,
                      60,
                    )
              }
            />
          </div>
          {!hasOverride ? (
            <div className="space-y-1">
              <Label className="text-xs">Escala Header (%)</Label>
              <Input
                type="number"
                value={textLayoutConfig.headerImageScalePct}
                onChange={(event) =>
                  patchGlobalRoot(
                    "headerImageScalePct",
                    event.target.value,
                    10,
                    100,
                  )
                }
              />
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Stand (mm)</Label>
              <Input
                type="number"
                value={layoutFieldsSource.standFontSizeMm}
                onChange={(event) =>
                  hasOverride
                    ? patchCouponOverrideRoot(
                        "standFontSizeMm",
                        event.target.value,
                        1.5,
                        5,
                      )
                    : patchGlobalRoot(
                        "standFontSizeMm",
                        event.target.value,
                        1.5,
                        5,
                      )
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sector (mm)</Label>
              <Input
                type="number"
                value={layoutFieldsSource.sectorFontSizeMm}
                onChange={(event) =>
                  hasOverride
                    ? patchCouponOverrideRoot(
                        "sectorFontSizeMm",
                        event.target.value,
                        1.5,
                        5,
                      )
                    : patchGlobalRoot(
                        "sectorFontSizeMm",
                        event.target.value,
                        1.5,
                        5,
                      )
                }
              />
            </div>
          </div>
          {BOX_KEYS.map(({ key, label }) => {
            const box = layoutFieldsSource[key];
            return (
              <div key={key} className="space-y-1.5">
                <p className="text-xs font-medium">{label}</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["xPct", "yPct", "widthPct", "heightPct"] as const).map(
                    (field) => (
                      <div key={field} className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          {field}
                        </Label>
                        <Input
                          type="number"
                          value={box[field]}
                          onChange={(event) =>
                            hasOverride
                              ? patchCouponOverrideBox(
                                  key,
                                  field,
                                  event.target.value,
                                )
                              : patchGlobalBox(
                                  key,
                                  field,
                                  event.target.value,
                                  field.includes("Pct") && field.startsWith("w")
                                    ? 10
                                    : field.includes("Pct") &&
                                        field.startsWith("h")
                                      ? 5
                                      : 0,
                                  100,
                                )
                          }
                        />
                      </div>
                    ),
                  )}
                </div>
              </div>
            );
          })}
          {selectedCouponId && !hasOverride ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onUpdateCoupon(selectedCouponId, { layoutOverride: {} })
              }
            >
              Crear override para este cupón
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
