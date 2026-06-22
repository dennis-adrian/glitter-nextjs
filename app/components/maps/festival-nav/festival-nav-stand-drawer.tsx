"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { BookOpen, Search, Stamp } from "lucide-react";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { getStandMapParticipants } from "@/app/components/maps/map-participants";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { Badge } from "@/app/components/ui/badge";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
} from "@/app/components/ui/drawer";
import { socialsUrls, socialsIcons } from "@/app/lib/users/utils";

export type CouponProof = {
  promoHighlight: string | null;
  promoDescription: string | null;
  promoConditions: string | null;
};

type FestivalNavStandDrawerProps = {
  stand: StandWithReservationsWithParticipants | null;
  sectorName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  couponBookProofs: Record<number, CouponProof[]>;
  passportUserIdSet: Set<number>;
  stickerHuntUserIdSet: Set<number>;
};

function getCategoryLabel(category: string): string {
  switch (category) {
    case "illustration":
    case "new_artist":
      return "ILUSTRACIÓN";
    case "gastronomy":
      return "GASTRONOMÍA";
    case "entrepreneurship":
      return "EMPRENDIMIENTO";
    default:
      return "";
  }
}

function formatStandLabel(
  stand: Pick<StandWithReservationsWithParticipants, "label" | "standNumber">,
): string {
  return `${stand.label ?? ""}${stand.standNumber}`;
}

export default function FestivalNavStandDrawer({
  stand,
  sectorName,
  open,
  onOpenChange,
  couponBookProofs,
  passportUserIdSet,
  stickerHuntUserIdSet,
}: FestivalNavStandDrawerProps) {
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    setActiveTab(0);
  }, [stand?.id]);

  const participants = stand ? getStandMapParticipants(stand) : [];

  const clampedTab = Math.min(activeTab, Math.max(0, participants.length - 1));

  if (!stand) return null;

  const currentParticipant = participants[clampedTab] ?? participants[0];
  const standLabel = formatStandLabel(stand);
  const categoryLabel = getCategoryLabel(stand.standCategory);
  const products = stand.standSubcategories.map((sc) => sc.subcategory.label);

  const couponProof =
    currentParticipant?.kind === "user" && currentParticipant.userId != null
      ? (couponBookProofs[currentParticipant.userId]?.[0] ?? null)
      : null;

  const isInPassport =
    currentParticipant?.kind === "user" && currentParticipant.userId != null
      ? passportUserIdSet.has(currentParticipant.userId)
      : false;

  const isInStickerHunt =
    currentParticipant?.kind === "user" && currentParticipant.userId != null
      ? stickerHuntUserIdSet.has(currentParticipant.userId)
      : false;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} modal={false}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="text-left pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="font-bold px-3 py-1 rounded-full">
              {standLabel}
            </Badge>
            {sectorName && (
              <span className="text-xs text-muted-foreground">
                {sectorName}
              </span>
            )}
            {categoryLabel && (
              <Badge
                variant="outline"
                className="text-xs font-semibold uppercase rounded-full border-primary text-primary"
              >
                {categoryLabel}
              </Badge>
            )}
          </div>
        </DrawerHeader>

        <div className="overflow-y-auto px-4 pb-6 space-y-4">
          {participants.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Sin información del participante
            </p>
          ) : (
            <>
              {/* Participant tabs */}
              {participants.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
                  {participants.map((p, index) => (
                    <button
                      key={p.id}
                      onClick={() => setActiveTab(index)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all shrink-0 ${
                        index === clampedTab
                          ? "bg-white shadow-sm border-primary"
                          : "bg-muted hover:bg-accent border-border"
                      }`}
                    >
                      <Avatar className="w-6 h-6">
                        <AvatarImage
                          src={p.imageUrl ?? undefined}
                          alt={p.displayName}
                        />
                      </Avatar>
                      <span className="text-xs font-medium truncate max-w-[100px]">
                        {p.displayName}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {currentParticipant && (
                <>
                  {/* Participant hero */}
                  <div className="flex items-center gap-3">
                    <Avatar className="w-14 h-14 border-2 border-primary shrink-0">
                      <AvatarImage
                        src={currentParticipant.imageUrl ?? undefined}
                        alt={currentParticipant.displayName}
                      />
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold truncate">
                        {currentParticipant.displayName}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Stand #{standLabel} · {sectorName}
                      </p>
                      {currentParticipant.kind === "external" && (
                        <Badge
                          variant="outline"
                          className="mt-2 rounded-full border-teal-600 text-teal-700"
                        >
                          {currentParticipant.categoryLabel}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Coupon section */}
                  {couponProof && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
                      <div className="flex items-center gap-2 text-amber-700 mb-2">
                        <BookOpen className="h-4 w-4 shrink-0" />
                        <span className="text-xs font-semibold uppercase tracking-wide">
                          Disponible en tu cuponera
                        </span>
                      </div>
                      {couponProof.promoHighlight && (
                        <p className="text-sm font-bold text-amber-900">
                          {couponProof.promoHighlight}
                        </p>
                      )}
                      {couponProof.promoDescription && (
                        <p className="text-sm text-amber-800">
                          {couponProof.promoDescription}
                        </p>
                      )}
                      {couponProof.promoConditions && (
                        <p className="text-xs italic text-amber-700">
                          {couponProof.promoConditions}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Passport section */}
                  {isInPassport && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                      <div className="flex items-center gap-2 text-emerald-700">
                        <Stamp className="h-4 w-4 shrink-0" />
                        <span className="text-xs font-semibold uppercase tracking-wide">
                          Participa en la carrera de sellos
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Sticker hunt section */}
                  {isInStickerHunt && (
                    <div className="rounded-lg border border-pink-200 bg-pink-50 p-3">
                      <div className="flex items-center gap-2 text-pink-700">
                        <Search className="h-4 w-4 shrink-0" />
                        <span className="text-xs font-semibold uppercase tracking-wide">
                          Participa en la cacería de stickers
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Products */}
                  {products.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">
                        Productos
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {products.map((product, index) => (
                          <Badge
                            key={index}
                            variant="outline"
                            className="text-xs rounded-full border-primary text-primary"
                          >
                            {product}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Social links */}
                  {currentParticipant.userSocials.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">
                        Contacto
                      </p>
                      <div className="space-y-2">
                        {currentParticipant.userSocials.map((social) => (
                          <a
                            key={social.id}
                            href={`${socialsUrls[social.type]}${social.username}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm hover:underline font-medium"
                            style={{
                              color:
                                social.type === "instagram"
                                  ? "#E8356A"
                                  : undefined,
                            }}
                          >
                            <FontAwesomeIcon
                              className="w-4 h-4"
                              icon={socialsIcons[social.type]}
                            />
                            @{social.username}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {currentParticipant.links.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">
                        Contacto
                      </p>
                      <div className="space-y-2">
                        {currentParticipant.links.map((link) => (
                          <a
                            key={link.href}
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm hover:underline font-medium text-teal-700"
                          >
                            {link.label}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
