import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/app/components/ui/breadcrumb";
import Title from "@/app/components/atoms/heading";
import UserInfractionCard from "@/app/components/molecules/user-infraction-card";
import UserSanctionCard from "@/app/components/molecules/user-sanction-card";
import { fetchParticipantDisciplinaryHistory } from "@/app/lib/infractions/participant-queries";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";
import { PackageOpenIcon } from "lucide-react";
import { notFound } from "next/navigation";
import { z } from "zod";

const ParamsSchema = z.object({
  profileId: z.coerce.number(),
});

type InfractionsPageProps = {
  params: Promise<z.infer<typeof ParamsSchema>>;
};

export default async function InfractionsPage(props: InfractionsPageProps) {
  const { profileId } = await props.params;
  const validatedParams = ParamsSchema.safeParse({
    profileId,
  });

  if (!validatedParams.success) {
    return notFound();
  }

  const { profileId: paramsProfileId } = validatedParams.data;

  const currentProfile = await getCurrentUserProfile();
  await protectRoute(currentProfile || undefined, paramsProfileId);

  const history = await fetchParticipantDisciplinaryHistory(paramsProfileId);
  const hasContent =
    history.infractions.length > 0 || history.sanctions.length > 0;

  return (
    <div className="container p-3 md:p-6 space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/my_history">Mi historial</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Infracciones</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {!hasContent ? (
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground mt-10">
          <PackageOpenIcon className="w-16 h-16" />
          <span>No hay infracciones ni sanciones registradas</span>
        </div>
      ) : (
        <>
          {history.sanctions.length > 0 && (
            <section className="space-y-3">
              <Title>Sanciones</Title>
              <p className="text-sm text-muted-foreground">
                Cada sanción se muestra una sola vez, aunque cubra varias
                infracciones.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {history.sanctions.map((sanction) => (
                  <UserSanctionCard key={sanction.id} sanction={sanction} />
                ))}
              </div>
            </section>
          )}

          {history.infractions.length > 0 && (
            <section className="space-y-3">
              <Title level={2}>Infracciones</Title>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {history.infractions.map((infraction) => (
                  <UserInfractionCard
                    key={infraction.id}
                    infraction={infraction}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
