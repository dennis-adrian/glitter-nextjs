import { Skeleton } from "@/app/components/ui/skeleton";

export default function LandingSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando inicio" role="status">
      <section className="relative isolate overflow-hidden bg-muted/20">
        <div className="relative mx-auto min-h-[730px] max-w-[1440px] overflow-hidden px-5 pb-[380px] pt-12 sm:min-h-[760px] sm:px-8 sm:pb-[400px] sm:pt-16 md:min-h-[800px] md:px-10 md:pb-[400px] lg:grid lg:min-h-[620px] lg:grid-cols-[minmax(0,1.08fr)_minmax(400px,0.92fr)] lg:items-center lg:gap-6 lg:px-20 lg:py-20">
          <div className="relative z-20 max-w-2xl lg:max-w-none lg:py-10">
            <Skeleton className="h-12 w-full max-w-md rounded-lg sm:h-14" />
            <Skeleton className="mt-3 h-12 w-2/3 max-w-xs rounded-lg sm:h-14" />
            <Skeleton className="mt-6 h-5 w-full max-w-xl" />
            <Skeleton className="mt-3 h-5 w-11/12 max-w-lg" />
            <div className="mt-6 flex items-center gap-4">
              <Skeleton className="h-12 w-44 rounded-full" />
              <Skeleton className="h-5 w-40" />
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-[28px] left-[5%] right-[-24%] h-[345px] sm:bottom-[16px] sm:left-[20%] sm:right-[-14%] sm:h-[400px] md:bottom-[12px] md:left-[30%] md:right-[-4%] md:top-auto md:h-[360px] lg:relative lg:inset-auto lg:h-[520px] lg:w-full">
            <div className="absolute bottom-[10%] left-[7%] right-[-4%] top-[11%] rotate-[-2deg] overflow-hidden rounded-[32px] border-2 border-border bg-muted">
              <span className="absolute -left-3 top-1/2 size-6 -translate-y-1/2 rounded-full bg-muted/20" />
              <span className="absolute -right-3 top-1/2 size-6 -translate-y-1/2 rounded-full bg-muted/20" />
              <span className="absolute bottom-[16%] left-[12%] top-[16%] border-l-2 border-dashed border-muted-foreground/20" />
            </div>
            <Skeleton className="absolute bottom-[1%] left-[27%] h-[82%] w-[48%] rounded-[46%_46%_24%_24%] bg-muted-foreground/20" />
            <Skeleton className="absolute bottom-[4%] left-[12%] h-[31%] w-[28%] rounded-[42%_50%_28%_36%] bg-muted-foreground/20" />
          </div>
        </div>
      </section>

      <section className="bg-muted/30 px-5 py-14 sm:px-8 lg:px-20 lg:py-20">
        <div className="mx-auto max-w-[1280px]">
          <Skeleton className="mx-auto h-10 w-72 rounded-lg" />
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {["artist", "visitor", "sponsor"].map((card) => (
              <div
                className="rounded-[24px] border border-border bg-background p-6 sm:p-8"
                key={card}
              >
                <Skeleton className="mx-auto h-36 w-36 rounded-[34%_42%_28%_36%]" />
                <Skeleton className="mt-6 h-7 w-3/4 rounded-lg" />
                <Skeleton className="mt-4 h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-11/12" />
                <Skeleton className="mt-6 h-5 w-36" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
