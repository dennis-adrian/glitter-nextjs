import UsersBuckets from "@/app/dashboard/festivals/[id]/allowed_participants/users-buckets";
import { getFestivalAvailableUsers } from "@/app/lib/festivals/actions";
import { FestivalAvailableUser } from "@/app/lib/festivals/definitions";
import { notFound } from "next/navigation";
import { z } from "zod";

const ParamsSchema = z.object({
  id: z.coerce.number(),
});

export default async function AllowedParticipantsPage(props: {
  params: Promise<z.infer<typeof ParamsSchema>>;
}) {
  const params = await props.params;
  const validatedParams = ParamsSchema.safeParse(params);
  if (!validatedParams.success) {
    return notFound();
  }
  const availableUsers = (
    await getFestivalAvailableUsers(validatedParams.data.id)
  ).sort((a, b) => a.id - b.id);

  // group users by category
  const availableUsersByCategory = availableUsers.reduce(
    (acc, user) => {
      acc[user.category] = [...(acc[user.category] || []), user];
      return acc;
    },
    {} as { [key: string]: FestivalAvailableUser[] },
  );

  // join all users already grouped and ordered by category
  const allUsersOrderedByCategory = Object.entries(
    availableUsersByCategory,
  ).flatMap(([category, users]) => users.map((user) => user));

  return (
    <div className="container p-3 md:p-6">
      <h1 className="text-xl md:text-2xl font-bold">
        Participantes Habilitados
      </h1>
      <UsersBuckets
        users={allUsersOrderedByCategory}
        festivalId={validatedParams.data.id}
      />
    </div>
  );
}
