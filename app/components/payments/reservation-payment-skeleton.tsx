import StepIndicator from "@/app/components/festivals/reservations/step-indicator";
import { Card, CardContent, CardHeader } from "@/app/components/ui/card";
import { Skeleton } from "@/app/components/ui/skeleton";

/**
 * The owner's payment screen while it loads (payments/page.tsx): the real step
 * row, which takes only static props, so nothing shifts when the page lands.
 */
export default function ReservationPaymentSkeleton() {
  return (
    <>
      <StepIndicator
        step={3}
        totalSteps={3}
        backLabel="Ver mi reserva"
        backHref="/my_profile"
      />
      <div className="container p-4 md:p-6" role="status" aria-busy="true">
        <span className="sr-only">Cargando…</span>
        <Skeleton className="mb-8 h-9 w-56" />
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <div className="flex flex-col gap-6">
            {/* Product details */}
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-40" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  <Skeleton className="h-24 w-24 shrink-0" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-28" />
                  {["w-full", "w-5/6", "w-4/6", "w-3/4"].map((width, index) => (
                    <Skeleton key={index} className={`h-3.5 ${width}`} />
                  ))}
                </div>
              </CardContent>
            </Card>
            {/* Payment summary */}
            <Card>
              <CardContent className="space-y-3 pt-6">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <div className="border-t" />
                <div className="flex gap-2">
                  <Skeleton className="h-10 flex-1" />
                  <Skeleton className="h-10 w-20 rounded-full" />
                </div>
                <Skeleton className="h-[76px] w-full" />
              </CardContent>
            </Card>
          </div>
          <div className="flex flex-col gap-6">
            {/* QR */}
            <Card>
              <CardContent className="flex flex-col items-center gap-3 pt-6">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-80 w-64 rounded-lg" />
              </CardContent>
            </Card>
            <Skeleton className="h-10 w-full rounded-full" />
          </div>
        </div>
      </div>
    </>
  );
}
