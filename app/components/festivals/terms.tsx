"use client";

import {
  BaseProfile,
  ProfileType,
  UserCategory,
} from "@/app/api/users/definitions";
import Heading from "@/app/components/atoms/heading";
import FestivalTermsDocument from "@/app/components/festival-terms/document";
import StandSpecificationsCards from "@/app/components/festivals/stand-specifications-cards";
import TermsForm from "@/app/components/festivals/terms-form";
import { isProfileInFestival } from "@/app/components/next_event/helpers";
import { RedirectButton } from "@/app/components/redirect-button";
import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert";
import { Label } from "@/app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import {
  FestivalSectorWithStands,
  FestivalSectorWithStandsWithReservationsWithParticipants,
} from "@/app/lib/festival_sectors/definitions";
import {
  getFestivalParticipationRequest,
  hasAcceptedCurrentFestivalTerms,
} from "@/app/lib/festival-terms/acceptance";
import type { FestivalTermsVersionWithSections } from "@/app/lib/festival-terms/definitions";
import { FestivalWithDates } from "@/app/lib/festivals/definitions";
import { formatFullDate } from "@/app/lib/formatters";
import { ArrowRightIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

type TermsAndConditionsProps = {
  festival: FestivalWithDates;
  forProfile: ProfileType;
  currentUser: BaseProfile;
  category: Exclude<UserCategory, "none">;
  festivalSectors: FestivalSectorWithStandsWithReservationsWithParticipants[];
  festivalSectorsWithAllowedCategoriesPromise: Promise<
    (FestivalSectorWithStands & {
      allowedCategories: UserCategory[];
    })[]
  >;
  termsVersion: FestivalTermsVersionWithSections | null;
  canAcceptTerms: boolean;
};

export default function TermsAndConditions(props: TermsAndConditionsProps) {
  const [selectedCategory, setSelectedCategory] = useState<
    Exclude<UserCategory, "none">
  >(props.category);

  const mapCategory =
    selectedCategory === "new_artist" ? "illustration" : selectedCategory;

  const publishedAt = props.termsVersion?.publishedAt;
  const currentVersionId = props.termsVersion?.id ?? null;
  const participationRequest = getFestivalParticipationRequest(
    props.forProfile,
    props.festival.id,
  );
  const acceptedCurrent = hasAcceptedCurrentFestivalTerms(
    props.forProfile,
    props.festival.id,
    currentVersionId,
  );
  const needsReacceptance =
    props.canAcceptTerms &&
    currentVersionId != null &&
    Boolean(participationRequest) &&
    !acceptedCurrent;
  const enrolled = isProfileInFestival(props.festival.id, props.forProfile);

  return (
    <div className="container mx-auto py-8 px-4 md:px-6">
      <div className="max-w-5xl mx-auto">
        {props.currentUser.role === "admin" && (
          <div className="flex flex-col gap-2 mb-4 max-w-fit">
            <Label>Categoría de los términos y condiciones</Label>
            <Select
              value={selectedCategory}
              onValueChange={(value) =>
                setSelectedCategory(value as Exclude<UserCategory, "none">)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="illustration">Ilustración</SelectItem>
                <SelectItem value="entrepreneurship">Emprendimiento</SelectItem>
                <SelectItem value="gastronomy">Gastronomía</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="text-left md:text-center mb-4">
          <Heading level={1}>Términos y Condiciones para Expositores</Heading>
          {publishedAt ? (
            <p className="text-xs md:text-sm text-muted-foreground mt-2">
              Última actualización: {formatFullDate(publishedAt)}
            </p>
          ) : null}
          <p className="text-sm md:text-base mt-3">
            Por favor, leé estos términos y condiciones cuidadosamente para
            habilitar tu participación en el festival.
          </p>
        </div>

        {props.festival.status === "published" ? (
          <Alert className="mb-6">
            <AlertTitle>Las reservas aún no están abiertas</AlertTitle>
            <AlertDescription>
              Podés leer los términos y condiciones, pero la inscripción y la
              reserva de espacios se habilitan cuando el festival esté activo.
            </AlertDescription>
          </Alert>
        ) : null}

        {needsReacceptance ? (
          <Alert className="mb-6">
            <AlertTitle>Hay una nueva versión de los términos</AlertTitle>
            <AlertDescription>
              Los términos y condiciones se actualizaron después de que los
              aceptaste. Volvé a leerlos y aceptá esta versión para continuar
              con tu participación en {props.festival.name}.
            </AlertDescription>
          </Alert>
        ) : null}

        {props.festival.termsAndConditionsUrl && (
          <Image
            className="mx-auto"
            src={props.festival.termsAndConditionsUrl}
            alt="Términos y condiciones"
            width={320}
            height={320}
          />
        )}

        <div className="flex flex-col gap-3 lg:gap-4 mb-6">
          <Heading level={2}>Sectores habilitados para tu categoría</Heading>

          <StandSpecificationsCards
            profileCategory={mapCategory}
            festivalSectorsWithAllowedCategoriesPromise={
              props.festivalSectorsWithAllowedCategoriesPromise
            }
            fullSectors={props.festivalSectors}
          />

          <div className="mb-4 text-xs text-muted-foreground">
            {mapCategory === "illustration" && (
              <p>
                * <b>Ilustradores que comparten espacio:</b> Si en el transcurso
                de tiempo entre confirmada la reserva y el día del evento una de
                las partes no puede participar, el otro ilustrador deberá
                hacerse cargo de ocupar el espacio completo, sin posibilidad de
                reemplazar al ilustrador que se dio de baja.
              </p>
            )}
            <p>
              ** <b>Puntos eléctricos:</b> Se debe comunicar a la organización
              con al menos 10 días de anticipación si el participante quiere
              hacer uso de alguno de los puntos eléctricos disponibles en el
              sector.
            </p>
          </div>
        </div>

        {props.termsVersion ? (
          <FestivalTermsDocument
            sections={props.termsVersion.sections}
            category={mapCategory}
            festival={props.festival}
          />
        ) : (
          <Alert className="mb-6">
            <AlertTitle>Términos en preparación</AlertTitle>
            <AlertDescription>
              La organización todavía no publicó los términos y condiciones para
              los participantes. Volvé más tarde o contactá a la organización si
              necesitás más información.
            </AlertDescription>
          </Alert>
        )}

        {props.canAcceptTerms && acceptedCurrent ? (
          <>
            <div className="text-sm w-full text-muted-foreground text-pretty mt-6">
              {mapCategory === "gastronomy" &&
              participationRequest?.status === "pending" ? (
                <>
                  Gracias por aceptar los términos y condiciones. La
                  organización evaluará tu participación en el sector
                  gastronómico y te notificará si has sido aprobado.
                </>
              ) : (
                <>
                  Gracias por aceptar los términos y condiciones. Para continuar
                  con tu reserva hacé clic en el botón de abajo.
                </>
              )}
            </div>
            {enrolled ? (
              <div className="flex justify-end mt-4">
                <RedirectButton
                  href={`/profiles/${props.forProfile.id}/festivals/${props.festival.id}/reservations/new`}
                >
                  Continuar
                  <ArrowRightIcon className="ml-2 w-4 h-4" />
                </RedirectButton>
              </div>
            ) : null}
          </>
        ) : props.canAcceptTerms && props.termsVersion ? (
          <div className="mt-6">
            <TermsForm
              festival={props.festival}
              profile={props.forProfile}
              isReacceptance={needsReacceptance}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
