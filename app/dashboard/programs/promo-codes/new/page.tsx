import Link from "next/link";
import { redirect } from "next/navigation";

import PromoCodeForm from "@/app/components/dashboard/programs/promo-code-form";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { fetchProgramsForPromoCodeForm } from "@/app/lib/programs/promo-code-admin-queries";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";

type Props = { searchParams: Promise<{ programId?: string }> };

export default async function NewProgramPromoCodePage({ searchParams }: Props) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) redirect("/dashboard");

  const [programs, query] = await Promise.all([
    fetchProgramsForPromoCodeForm(),
    searchParams,
  ]);
  const defaultProgramId = Number(query.programId);

  return (
    <div className="container mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div>
        <Link
          href="/dashboard/programs/promo-codes"
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          ← Códigos promocionales
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Nuevo código</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Campaña</CardTitle>
        </CardHeader>
        <CardContent>
          <PromoCodeForm
            programs={programs}
            defaultProgramId={
              Number.isInteger(defaultProgramId) && defaultProgramId > 0
                ? defaultProgramId
                : null
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
