import SendEmailsForm from "@/app/dashboard/festivals/[id]/allowed_participants/send-emails-form";
import { getFestivalAvailableUsers } from "@/app/data/festivals/actions";
import { notFound } from "next/navigation";
import { z } from "zod";

const ParamsSchema = z.object({
	id: z.coerce.number(),
});

export default async function AllowedParticipantsPage(props: {
	params: Promise<z.infer<typeof ParamsSchema>>;
}) {
	const params = await props.params;
	const validatedParams = ParamsSchema.safeParse(params);
	if (!validatedParams.success) {
		return notFound();
	}
	const availableUsers = (
		await getFestivalAvailableUsers(validatedParams.data.id)
	).sort((a, b) => a.id - b.id);

	const gastronomyUsers = availableUsers.filter(
		(user) => user.category === "gastronomy",
	);

	const entrepreneurshipUsers = availableUsers.filter(
		(user) => user.category === "entrepreneurship",
	);

	const illustrationUsers = availableUsers.filter(
		(user) => user.category === "illustration",
	);

	return (
		<div className="container p-3 md:p-6">
			<h1 className="text-xl md:text-2xl font-bold">
				Participantes Habilitados
			</h1>
			{illustrationUsers.length > 0 && (
				<div className="p-4 border rounded-md mt-4">
					<div className="flex justify-between items-center">
						<h2 className="text-lg font-bold">Ilustración</h2>
						<SendEmailsForm
							users={illustrationUsers}
							festivalId={validatedParams.data.id}
						/>
					</div>
					<ol className="list-decimal list-inside">
						{illustrationUsers.map((user) => (
							<li key={user.id}>
								Id: {user.id} - {user.displayName} - {user.email}
							</li>
						))}
					</ol>
				</div>
			)}
			{entrepreneurshipUsers.length > 0 && (
				<div className="p-4 border rounded-md mt-4">
					<div className="flex justify-between items-center">
						<h2 className="text-lg font-bold">Emprendimientos</h2>
						<SendEmailsForm
							users={entrepreneurshipUsers}
							festivalId={validatedParams.data.id}
						/>
					</div>
					<ol className="list-decimal list-inside">
						{entrepreneurshipUsers.map((user) => (
							<li key={user.id}>
								Id: {user.id} - {user.displayName} - {user.email}
							</li>
						))}
					</ol>
				</div>
			)}
			{gastronomyUsers.length > 0 && (
				<div className="p-4 border rounded-md mt-4">
					<div className="flex justify-between items-center">
						<h2 className="text-lg font-bold">Gastronomía</h2>
						<SendEmailsForm
							users={gastronomyUsers}
							festivalId={validatedParams.data.id}
						/>
					</div>
					<ol className="list-decimal list-inside">
						{gastronomyUsers.map((user) => (
							<li key={user.id}>
								Id: {user.id} - {user.displayName} - {user.email}
							</li>
						))}
					</ol>
				</div>
			)}
		</div>
	);
}
