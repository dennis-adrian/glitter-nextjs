const legendItems = [
  {
    label: "Disponible",
    color: "bg-violet-200/60 border-violet-500/60",
  },
  {
    label: "Seleccionado",
    color: "bg-violet-800/85 border-violet-800",
  },
  {
    label: "Ocupado",
    color: "bg-gray-300/50 border-gray-400/60",
  },
  {
    label: "No disponible",
    color: "bg-gray-200/35 border-gray-300/40",
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
