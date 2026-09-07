import {
  ClockIcon,
  CoinsIcon,
  HelpCircleIcon,
  PackageIcon,
  ShoppingBagIcon,
  StarIcon,
  UserIcon,
} from "lucide-react";
import Link from "next/link";

import { ProfileType } from "@/app/api/users/definitions";
import { isFeatureEnabled } from "@/app/lib/feature_flags/helpers";

type Action = {
  icon: React.ElementType;
  label: string;
  href: string;
  color: string;
};

type Props = {
  profile: ProfileType;
};

export default async function QuickActions({ profile }: Props) {
  // Both credit tiles appear together or not at all: a wallet with no
  // explanation beside it is where the questions come from.
  const creditsEnabled = await isFeatureEnabled("credits");

  const actions: Action[] = [
    {
      icon: UserIcon,
      label: "Mi perfil",
      href: `/public_profiles/${profile.id}`,
      color: "bg-violet-100 text-violet-600 group-hover:bg-violet-200",
    },
    {
      icon: StarIcon,
      label: "Participaciones",
      href: "/my_participations",
      color: "bg-amber-100 text-amber-600 group-hover:bg-amber-200",
    },
    {
      icon: ClockIcon,
      label: "Historial",
      href: "/my_history",
      color: "bg-sky-100 text-sky-600 group-hover:bg-sky-200",
    },
    ...(profile.status === "verified"
      ? [
          {
            icon: ShoppingBagIcon,
            label: "Tienda",
            href: "/merch",
            color: "bg-green-100 text-green-600 group-hover:bg-green-200",
          },
        ]
      : []),
    {
      icon: PackageIcon,
      label: "Mis órdenes",
      href: "/my_orders",
      color: "bg-rose-100 text-rose-600 group-hover:bg-rose-200",
    },
    ...(creditsEnabled
      ? [
          {
            icon: CoinsIcon,
            label: "Mis créditos",
            href: "/my_credits",
            color: "bg-yellow-100 text-yellow-600 group-hover:bg-yellow-200",
          },
          {
            icon: HelpCircleIcon,
            label: "Qué son los créditos",
            href: "/credits_info",
            color: "bg-cyan-100 text-cyan-600 group-hover:bg-cyan-200",
          },
        ]
      : []),
  ];

  return (
    <div>
      <h2 className="font-space-grotesk font-bold tracking-wide text-lg mb-3">
        Acceso rápido
      </h2>
      <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
        {actions.map(({ icon: Icon, label, href, color }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-2 p-3 rounded-xl bg-muted/40 hover:bg-muted/60 transition-colors text-center group"
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${color}`}
            >
              <Icon className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium leading-tight">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
