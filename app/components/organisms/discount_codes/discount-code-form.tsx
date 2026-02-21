"use client";

import DateInput from "@/app/components/form/fields/date";
import { Button } from "@/app/components/ui/button";
import { DateTime } from "luxon";
import SelectInput from "@/app/components/form/fields/select";
import TextInput from "@/app/components/form/fields/text";
import ComboboxInput from "@/app/components/form/fields/combobox";
import SubmitButton from "@/app/components/simple-submit-button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/app/components/ui/form";
import { Switch } from "@/app/components/ui/switch";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/app/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/app/components/ui/popover";
import { cn } from "@/app/lib/utils";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import {
	createDiscountCode,
	updateDiscountCode,
} from "@/app/lib/discount_codes/actions";
import { DiscountCodeBase } from "@/app/lib/discount_codes/definitions";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const FormSchema = z.object({
	code: z.string().trim().min(1, "El código es requerido"),
	discountUnit: z.enum(["percentage", "amount"]),
	discountValue: z.coerce.number().positive("El valor debe ser mayor a 0"),
	maxUses: z
		.preprocess(
			(value) => (value === "" ? null : value),
			z.coerce.number().int().positive().nullable(),
		)
		.optional(),
	festivalId: z.coerce.number().int().positive().nullable().optional(),
	userId: z.coerce.number().int().positive().nullable().optional(),
	expiresAt: z.coerce.date({
		message: "La fecha de vencimiento es requerida",
	}),
	isActive: z.boolean().default(true),
});

type Option = { label: string; value: string };

export type UserOption = {
	value: string;
	displayName: string | null;
	firstName: string | null;
	lastName: string | null;
	email: string;
};

type DiscountCodeFormProps = {
	festivalsOptions: Option[];
	usersOptions: UserOption[];
	discountCode?: DiscountCodeBase;
};

function getUserDisplayName(user: UserOption) {
	return (
		(user.displayName ??
			[user.firstName, user.lastName].filter(Boolean).join(" ")) ||
		user.email
	);
}

export default function DiscountCodeForm({
	festivalsOptions,
	usersOptions,
	discountCode,
}: DiscountCodeFormProps) {
	const router = useRouter();
	const isEditing = !!discountCode;
	const [userOpen, setUserOpen] = useState(false);

	const form = useForm<
		z.input<typeof FormSchema>,
		unknown,
		z.output<typeof FormSchema>
	>({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			code: discountCode?.code ?? "",
			discountUnit: discountCode?.discountUnit ?? "percentage",
			discountValue: discountCode?.discountValue ?? undefined,
			maxUses: discountCode?.maxUses ?? undefined,
			festivalId: discountCode?.festivalId ?? undefined,
			userId: discountCode?.userId ?? undefined,
			expiresAt: discountCode?.expiresAt
				? new Date(discountCode.expiresAt)
				: undefined,
			isActive: discountCode?.isActive ?? true,
		},
	});

	const action = form.handleSubmit(async (data) => {
		const payload = {
			...data,
			code: data.code.toUpperCase(),
			maxUses: data.maxUses ?? null,
			festivalId: data.festivalId ?? null,
			userId: data.userId ?? null,
		};

		let res;
		if (isEditing) {
			res = await updateDiscountCode(discountCode.id, payload);
		} else {
			res = await createDiscountCode(payload);
		}

		if (res.success) {
			toast.success(res.message);
			router.push("/dashboard/discount_codes");
		} else {
			toast.error(res.message);
		}
	});

	const discountUnitOptions: Option[] = [
		{ label: "Porcentaje (%)", value: "percentage" },
		{ label: "Monto fijo (Bs)", value: "amount" },
	];

	return (
		<Form {...form}>
			<form className="grid gap-4" onSubmit={action}>
				<TextInput
					formControl={form.control}
					label="Código"
					name="code"
					placeholder="EJEMPLO2025"
					className="uppercase"
				/>
				<SelectInput
					formControl={form.control}
					label="Tipo de descuento"
					name="discountUnit"
					options={discountUnitOptions}
					placeholder="Seleccionar tipo"
				/>
				<TextInput
					formControl={form.control}
					label="Valor"
					name="discountValue"
					type="number"
					min="0"
					step="0.01"
					placeholder="0"
				/>
				<TextInput
					formControl={form.control}
					label="Límite de usos (opcional, vacío = ilimitado)"
					name="maxUses"
					type="number"
					min="1"
					step="1"
					placeholder="Sin límite"
				/>
				<ComboboxInput
					form={form}
					label="Festival (opcional, vacío = global)"
					name="festivalId"
					options={festivalsOptions}
					placeholder="Todos los festivales"
				/>
				<FormField
					control={form.control}
					name="userId"
					render={({ field }) => {
						const selectedUser = usersOptions.find(
							(u) => u.value === String(field.value),
						);

						return (
							<FormItem className="flex flex-col gap-2 w-full">
								<FormLabel>Usuario (opcional, vacío = cualquiera)</FormLabel>
								<Popover open={userOpen} onOpenChange={setUserOpen}>
									<PopoverTrigger asChild>
										<FormControl>
											<Button
												variant="outline"
												role="combobox"
												className={cn(
													"w-full justify-between h-auto min-h-10",
													!field.value && "text-muted-foreground",
												)}
											>
												{selectedUser ? (
													<span className="flex flex-col items-start text-left">
														<span className="text-sm">
															{getUserDisplayName(selectedUser)}
														</span>
														<span className="text-xs text-muted-foreground">
															{selectedUser.email}
														</span>
													</span>
												) : (
													"Cualquier usuario"
												)}
												<ChevronsUpDownIcon className="opacity-50 shrink-0" />
											</Button>
										</FormControl>
									</PopoverTrigger>
									<PopoverContent className="w-full p-0" align="start">
										<Command>
											<CommandInput
												placeholder="Buscar por nombre o email..."
												className="h-9"
											/>
											<CommandList>
												<CommandEmpty>Sin resultados.</CommandEmpty>
												<CommandGroup>
													{usersOptions.map((user) => {
														const searchValue = [
															user.displayName,
															user.firstName,
															user.lastName,
															user.email,
														]
															.filter(Boolean)
															.join(" ");

														return (
															<CommandItem
																key={user.value}
																value={searchValue}
																onSelect={() => {
																	form.setValue("userId", Number(user.value), {
																		shouldDirty: true,
																	});
																	setUserOpen(false);
																}}
															>
																<div className="flex flex-col">
																	<span>{getUserDisplayName(user)}</span>
																	<span className="text-xs text-muted-foreground">
																		{user.email}
																	</span>
																</div>
																<CheckIcon
																	className={cn(
																		"ml-auto shrink-0",
																		String(field.value) === user.value
																			? "opacity-100"
																			: "opacity-0",
																	)}
																/>
															</CommandItem>
														);
													})}
												</CommandGroup>
											</CommandList>
										</Command>
									</PopoverContent>
								</Popover>
								<FormMessage />
							</FormItem>
						);
					}}
				/>
				<div className="grid gap-2">
					<DateInput
						formControl={form.control}
						label="Fecha de vencimiento"
						name="expiresAt"
					/>
					<div className="flex gap-2">
						{(
							[
								{ label: "1 semana", plus: { weeks: 1 } },
								{ label: "1 mes", plus: { months: 1 } },
								{ label: "1 año", plus: { years: 1 } },
							] as const
						).map(({ label, plus }) => (
							<Button
								key={label}
								type="button"
								variant="outline"
								size="sm"
								onClick={() =>
									form.setValue(
										"expiresAt",
										DateTime.now().plus(plus).toJSDate(),
										{ shouldDirty: true },
									)
								}
							>
								{label}
							</Button>
						))}
					</div>
				</div>
				<FormField
					control={form.control}
					name="isActive"
					render={({ field }) => (
						<FormItem className="flex items-center gap-3">
							<FormControl>
								<Switch
									checked={field.value}
									onCheckedChange={field.onChange}
								/>
							</FormControl>
							<FormLabel className="mt-0!">Activo</FormLabel>
						</FormItem>
					)}
				/>
				<SubmitButton
					disabled={form.formState.isSubmitting || !form.formState.isDirty}
					loading={form.formState.isSubmitting}
				>
					{isEditing ? "Guardar cambios" : "Crear código"}
				</SubmitButton>
			</form>
		</Form>
	);
}
