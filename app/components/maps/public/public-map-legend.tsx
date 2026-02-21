const legendItems = [
	{
		label: "Disponible",
		color: "bg-violet-200/60 border-violet-500/60",
	},
	{
		label: "Ocupado",
		color: "bg-violet-700/70 border-violet-800/80",
	},
];

export default function PublicMapLegend() {
	return (
		<div className="flex flex-wrap items-center gap-3">
			{legendItems.map((item) => (
				<div key={item.label} className="flex items-center gap-1.5">
					<div className={`w-3 h-3 rounded-sm border ${item.color}`} />
					<span className="text-xs text-muted-foreground">{item.label}</span>
				</div>
			))}
		</div>
	);
}
