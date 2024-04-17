import { fetchStandsByFestivalId } from "@/app/api/stands/actions";
import {
  BaseProfile,
  ProfileType,
  UserCategory,
} from "@/app/api/users/definitions";
import ClientMap from "@/app/components/festivals/client-map";
import ParticipantsGrid from "@/app/components/festivals/participants";
import { fetchAvailableArtistsInFestival } from "@/app/data/festivals/actions";
import { FestivalBase } from "@/app/data/festivals/definitions";
import { getMapLabel, getMapPageTitle } from "@/app/lib/maps/helpers";

export default async function Festival({
  isGeneralView,
  profile,
  festival,
  category,
}: {
  isGeneralView?: boolean;
  festival: FestivalBase;
  profile: ProfileType | null;
  category: Exclude<UserCategory, "none">;
}) {
  const stands = await fetchStandsByFestivalId(festival.id, category);
  const mainStands = stands.filter((stand) => stand.zone === "main");
  const secondaryStands = stands.filter((stand) => stand.zone === "secondary");
  if (mainStands.length === 0) return null;

  let acceptedArtists: BaseProfile[] = [];
  if (category === "illustration") {
    acceptedArtists = await fetchAvailableArtistsInFestival(festival.id);
  }

  return (
    <div className={isGeneralView ? "" : "container p-4 md:p-6"}>
      {isGeneralView ? (
        <h3 className="font-semibold text-xl my-4">
          {getMapPageTitle(category)}
        </h3>
      ) : (
        <>
          <h1 className="font-bold text-2xl my-4">
            {getMapPageTitle(category)}
          </h1>
          <p>Selecciona un espacio disponible</p>
          <div className="my-4">
            <ul>
              <li className="flex items-center gap-2">
                <div className="w-[16px] h-[16px] bg-white border"></div>
                Disponible
              </li>
              <li className="flex items-center gap-2">
                <div className="w-[16px] h-[16px] bg-emerald-200"></div>
                Reservado
              </li>
              <li className="flex items-center gap-2">
                <div className="w-[16px] h-[16px] bg-rose-600"></div>
                Confirmado
              </li>
              <li className="flex items-center gap-2">
                <div className="bg-zinc-800 w-[16px] h-[16px]"></div>
                Deshabilitado
              </li>
            </ul>
          </div>
        </>
      )}
      <div className="flex flex-wrap gap-4">
        <div className="mx-auto max-w-[420px]">
          <div>
            {isGeneralView ? (
              <>
                <h4 className="capitalize font-semibold text-lg">
                  {getMapLabel(category, "main")}
                </h4>
                <p className="text-sm">
                  Espacios del {mainStands[0]?.label}
                  {mainStands[0]?.standNumber} al {mainStands[0]?.label}
                  {mainStands[mainStands.length - 1]?.standNumber}
                </p>
              </>
            ) : (
              <h2 className="capitalize font-semibold text-lg">
                {getMapLabel(category, "main")}
              </h2>
            )}
            <ClientMap
              artists={acceptedArtists}
              profile={profile}
              stands={mainStands}
              category={category}
              mapVersion={festival.mapsVersion}
              zone="main"
            />
            <p className="text-center text-[10px] md:text-xs text-muted-foreground leading-3 md:leading-4">
              El plano muestra las ubicaciones y la distribución confirmada de
              los stands. Las medidas y proporciones de todos los elementos son
              estimadas y se utilizan de manera orientativa
            </p>
          </div>
          {secondaryStands.length > 0 && (
            <div>
              {isGeneralView ? (
                <>
                  <h4 className="capitalize font-semibold text-lg">
                    {getMapLabel(category, "secondary")}
                  </h4>
                  <p className="text-sm">
                    Espacios del {secondaryStands[0]?.label}
                    {secondaryStands[0]?.standNumber} al{" "}
                    {secondaryStands[0]?.label}
                    {secondaryStands[secondaryStands.length - 1]?.standNumber}
                  </p>
                </>
              ) : (
                <h2 className="capitalize font-semibold text-lg">
                  {getMapLabel(category, "secondary")}
                </h2>
              )}
              <ClientMap
                artists={acceptedArtists}
                profile={profile}
                stands={secondaryStands}
                category={category}
                mapVersion={festival.mapsVersion}
                zone="secondary"
              />
              <p className="text-center text-[10px] md:text-xs text-muted-foreground leading-3 md:leading-4">
                El plano muestra las ubicaciones y la distribución confirmada de
                los stands. Las medidas y proporciones de todos los elementos
                son estimadas y se utilizan de manera orientativa
              </p>
            </div>
          )}
        </div>
        <div className="mx-auto">
          <ParticipantsGrid stands={stands} />
        </div>
      </div>
    </div>
  );
}
