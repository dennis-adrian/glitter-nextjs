const legendItems = [
  {
    label: "Disponible",
    color: "bg-amber-100 border-amber-400",
  },
  {
    label: "Reservado",
    color: "bg-emerald-300/35 border-emerald-400",
  },
  {
    label: "Confirmado",
    color: "bg-rose-500/35 border-rose-500",
  },
  {
    label: "Deshabilitado",
    color: "bg-zinc-800/40 border-zinc-500",
  },
];

export default function MapLegend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
      {legendItems.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <div
            className={`w-3 h-3 rounded-sm border ${item.color}`}
          />
          <span className="text-xs text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
