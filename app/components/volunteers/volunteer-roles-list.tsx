import type { VolunteerRole } from "@/app/lib/volunteers/definitions";

/** Placeholder: one card per active role, from the festival's rows. */
export default function VolunteerRolesList({
  roles,
}: {
  roles: VolunteerRole[];
}) {
  return (
    <section className="grid gap-4">
      <h2 className="text-2xl font-semibold">Roles</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {roles.map((role) => (
          <li key={role.id} className="min-w-0 rounded-lg border p-4">
            <h3 className="font-semibold break-words">{role.name}</h3>
            <p className="text-sm text-muted-foreground break-words">
              {role.description}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
