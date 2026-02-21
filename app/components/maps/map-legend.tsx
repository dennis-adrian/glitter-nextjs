const legendItems = [
	{
		label: "Disponible",
		color: "bg-violet-200/60 border-violet-500/80",
	},
	{
		label: "Seleccionado",
		color: "bg-primary border-white ring-2 ring-primary-200",
	},
	{
		label: "En espera",
		color: "bg-amber-400/60 border-amber-600/80",
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
		<div className="flex flex-wrap gap-2">
			{legendItems.map((item) => (
				<div key={item.label} className="flex items-center gap-2">
					<div className={`w-3 h-3 rounded-sm border ${item.color}`} />
					<span className="text-xs text-muted-foreground">{item.label}</span>
				</div>
			))}
		</div>
	);
}
