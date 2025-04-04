export default function NotFound() {
  return (
    <div className="flex min-h-[70dvh] md:min-h-[50dvh] flex-col items-center justify-center bg-background px-4 text-center">
      <div className="mx-auto flex max-w-[500px] flex-col items-center justify-center space-y-6">
        <div className="relative h-40 w-40">
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-muted text-[120px] font-bold opacity-10">
            404
          </div>
          <div className="absolute inset-0 flex items-center justify-center text-5xl font-bold">
            404
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl">
            No se encontraron resultados
          </h1>
          <p className="text-muted-foreground">
            No pudimos encontrar lo que estás buscando.
          </p>
        </div>
      </div>
    </div>
  );
}
