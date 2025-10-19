export default function Title({ children }: { children: React.ReactNode }) {
	return (
		<h1 className="text-2xl md:text-4xl font-bold tracking-tight">
			{children}
		</h1>
	);
}
