"use client";

import { BaseProfile } from "@/app/api/users/definitions";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/app/components/ui/table";
import { Badge, BadgeVariant } from "@/app/components/ui/badge";
import { getCategoryLabel } from "@/app/lib/maps/helpers";
import { useState } from "react";
import SendEmailsForm from "@/app/dashboard/festivals/[id]/allowed_participants/send-emails-form";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/app/components/ui/select";

export default function UsersBuckets({
	users,
	festivalId,
}: {
	users: BaseProfile[];
	festivalId: number;
}) {
	const [bucketAmount, setBucketAmount] = useState(10);
	const buckets = users.reduce(
		(acc, user, index) => {
			const bucketIndex = Math.floor(index / bucketAmount);
			if (!acc[bucketIndex]) {
				acc[bucketIndex] = [];
			}
			acc[bucketIndex].push(user);
			return acc;
		},
		[] as { [key: number]: BaseProfile[] },
	);

	return (
		<div className="my-4">
			<p className="text-gray-500">Cantidad de participantes por bucket:</p>
			<Select
				value={bucketAmount.toString()}
				onValueChange={(value) => setBucketAmount(parseInt(value))}
			>
				<SelectTrigger className="w-24">
					<SelectValue placeholder="Selecciona el número de participantes por bucket" />
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						<SelectLabel>Nro de participantes por bucket</SelectLabel>
						<SelectItem value="10">10</SelectItem>
						<SelectItem value="20">20</SelectItem>
						<SelectItem value="30">30</SelectItem>
						<SelectItem value="40">40</SelectItem>
						<SelectItem value="50">50</SelectItem>
					</SelectGroup>
				</SelectContent>
			</Select>
			{Object.entries(buckets).map(([bucketIndex, bucketUsers]) => (
				<div key={bucketIndex}>
					<div className="my-4 flex justify-between items-center">
						<h2 className="text-lg font-semibold">
							Bucket {parseInt(bucketIndex) + 1}
						</h2>
						<SendEmailsForm users={bucketUsers} festivalId={festivalId} />
					</div>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Nombre</TableHead>
								<TableHead>Email</TableHead>
								<TableHead>Categoría</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{bucketUsers.map((user) => (
								<TableRow key={user.id}>
									<TableCell>{user.displayName}</TableCell>
									<TableCell>{user.email}</TableCell>
									<TableCell>
										<Badge
											className="font-normal min-w-fit"
											variant={user.category as BadgeVariant}
										>
											{getCategoryLabel(user.category)}
										</Badge>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			))}
		</div>
	);
}
