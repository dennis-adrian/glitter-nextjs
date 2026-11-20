import { volunteerRoleIcon } from "@/app/components/volunteers/volunteer-role-icon";
import {
  VOLUNTEER_COPY,
  type VolunteerRole,
} from "@/app/lib/volunteers/definitions";

/** One card per active role, from the festival's rows. */
export default function VolunteerRolesGrid({
  roles,
}: {
  roles: VolunteerRole[];
}) {
  return (
    <section id="roles" className="bg-brand-lavender">
      <div className="mx-auto max-w-7xl px-5 py-14 md:px-10 md:py-20 lg:px-20">
        <h2 className="font-display text-[30px] leading-[1.1] font-extrabold tracking-[-0.5px] text-brand-ink md:text-[44px]">
          {VOLUNTEER_COPY.rolesTitle}
        </h2>
        <p className="mt-4 max-w-2xl break-words text-brand-neutral">
          {VOLUNTEER_COPY.rolesLead}
        </p>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((role) => {
            const Icon = volunteerRoleIcon(role.name);
            return (
              <li
                key={role.id}
                className="min-w-0 rounded-[20px] border border-brand-border bg-brand-card p-6"
              >
                <div className="flex size-11 items-center justify-center rounded-full bg-brand-lavender text-brand-primary">
                  <Icon className="size-5" aria-hidden />
                </div>
                <h3 className="mt-4 font-display text-xl leading-7 font-bold break-words text-brand-ink">
                  {role.name}
                </h3>
                <p className="mt-2 text-sm leading-6 break-words text-brand-neutral">
                  {role.description}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
