"use client";

import { PlusCircleIcon, Trash2Icon } from "lucide-react";

import { BaseProfile } from "@/app/api/users/definitions";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Label } from "@/app/components/ui/label";
import { SearchOption } from "@/app/components/ui/search-input/search-content";
import SearchInput from "@/app/components/ui/search-input/input";
import ProfileQuickViewInfo from "@/app/components/users/profile-quick-view-info";

type Artist = Omit<BaseProfile, "userRequests" | "participations">;

/**
 * Who is on the reservation, as one section rather than a box per person.
 *
 * The owner and the partner are the same kind of thing, so they read as two
 * rows of one list separated by a rule — bordering each of them separately
 * made them look like unrelated panels, and nested a card inside a card to do
 * it.
 */
export default function ReservationParticipantsSection({
  owner,
  partner,
  artistsOptions,
  showPartnerSearch,
  onShowPartnerSearch,
  onAddPartner,
  onRemovePartner,
}: {
  owner: Artist;
  partner: Artist | undefined;
  artistsOptions: SearchOption[];
  showPartnerSearch: boolean;
  onShowPartnerSearch: () => void;
  onAddPartner: (userId: number) => void;
  onRemovePartner: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Participantes</CardTitle>
        <CardDescription>
          Quién reservó el espacio y, si lo comparte, con quién.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        <div className="pb-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Titular
          </p>
          <ProfileQuickViewInfo
            showAdminControls
            profile={{ ...owner, profileSubcategories: [] }}
          />
        </div>

        {partner ? (
          <div className="pt-4">
            <div className="mb-2 flex items-start justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Acompañante
              </p>
              <button
                type="button"
                aria-label="Quitar acompañante"
                className="text-destructive hover:text-red-600"
                onClick={onRemovePartner}
              >
                <Trash2Icon className="h-4 w-4" />
              </button>
            </div>
            <ProfileQuickViewInfo
              showAdminControls
              profile={{ ...partner, profileSubcategories: [] }}
            />
          </div>
        ) : showPartnerSearch ? (
          <div className="space-y-2 pt-4">
            <Label htmlFor="first-participant">
              Buscá el compañero de espacio
            </Label>
            <SearchInput
              id="first-participant"
              options={artistsOptions}
              onSelect={onAddPartner}
            />
          </div>
        ) : (
          <div className="pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onShowPartnerSearch}
            >
              <PlusCircleIcon className="mr-2 h-4 w-4" />
              Agregar acompañante
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
