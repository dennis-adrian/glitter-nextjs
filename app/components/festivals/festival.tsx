import { fetchStandsByFestivalId } from "@/app/api/stands/actions";
import { ProfileType, UserCategory } from "@/app/api/users/definitions";
import ClientMap from "@/app/components/festivals/client-map";
import { FestivalBase } from "@/app/data/festivals/definitions";
import { getMapLabel, getMapPageTitle } from "@/app/lib/maps/helpers";

export default async function Festival({
  profile,
  festival,
  category,
}: {
  festival: FestivalBase;
  profile: ProfileType | null;
  category: Exclude<UserCategory, "none">;
}) {
  const stands = await fetchStandsByFestivalId(festival.id, category);
  const mainStands = stands.filter((stand) => stand.zone === "main");
  const secondaryStands = stands.filter((stand) => stand.zone === "secondary");

  return (
    <div className="container p-4 md:p-6">
      <h1 className="font-bold text-2xl my-4">{getMapPageTitle(category)}</h1>
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
      <div className="m-auto max-w-[420px]">
        <div className="flex w-full flex-col items-center justify-center gap-4">
          <div>
            <h2 className="capitalize font-semibold text-lg">
              {getMapLabel(category, "main")}
            </h2>
            <p>
              Espacios del {mainStands[0].label}
              {mainStands[0].standNumber} al {mainStands[0].label}
              {mainStands[mainStands.length - 1].standNumber}
            </p>
            <ClientMap
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
              <h2 className="capitalize font-semibold text-lg">
                {getMapLabel(category, "secondary")}
              </h2>
              <p>
                Espacios del {secondaryStands[0]?.label}
                {secondaryStands[0]?.standNumber} al {secondaryStands[0]?.label}
                {secondaryStands[secondaryStands.length - 1]?.standNumber}
              </p>
              <ClientMap
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
      </div>
    </div>
  );
}
