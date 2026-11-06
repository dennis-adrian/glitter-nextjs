const legendItems = [
  {
    label: "Disponible",
    color:
      "bg-violet-200/60 border-violet-500/80 dark:bg-(--map-available-fill) dark:border-(--map-available-stroke)",
  },
  {
    label: "Seleccionado",
    color: "bg-primary border-white ring-2 ring-primary-200",
  },
  {
    label: "En espera",
    color:
      "bg-amber-400/60 border-amber-600/80 dark:bg-(--map-held-fill) dark:border-(--map-held-stroke)",
  },
  {
    label: "Reservado",
    color:
      "bg-rose-300/70 border-rose-600/80 dark:bg-(--map-reserved-fill) dark:border-(--map-reserved-stroke)",
  },
  {
    label: "Ocupado",
    color:
      "bg-gray-300/50 border-gray-400/60 dark:bg-(--map-taken-fill) dark:border-(--map-taken-stroke)",
  },
  {
    label: "Externo",
    color: "bg-teal-600/80 border-teal-800/90",
  },
  {
    label: "No disponible",
    color:
      "bg-gray-200/35 border-gray-300/40 dark:bg-(--map-unavailable-fill) dark:border-(--map-unavailable-stroke)",
  },
];

export default function MapLegend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {legendItems.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-sm border ${item.color}`} />
          <span className="text-xs text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
