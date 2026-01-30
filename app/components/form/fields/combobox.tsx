import { Button } from "@/app/components/ui/button";
import {
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/app/components/ui/form";
import { cn } from "@/app/lib/utils";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useState } from "react";
import { FieldValues, Path, PathValue, UseFormReturn } from "react-hook-form";

type ComboboxInputProps<T extends FieldValues> = {
	form: UseFormReturn<T>;
	options: { value: string; label: string }[];
	name: Path<T>;
	label?: string;
	description?: string;
	placeholder?: string;
};
export default function ComboboxInput<T extends FieldValues>({
	form,
	options,
	name,
	label,
	description,
	placeholder,
}: ComboboxInputProps<T>) {
	const [open, setOpen] = useState(false);

	return (
		<FormField
			control={form.control}
			name={name}
			render={({ field }) => (
				<FormItem className="flex flex-col gap-2 w-full">
					{label && <FormLabel>{label}</FormLabel>}
					<Popover open={open} onOpenChange={setOpen}>
						<PopoverTrigger asChild>
							<FormControl>
								<Button
									variant="outline"
									role="combobox"
									className={cn(
										"w-full justify-between",
										!field.value && "text-muted-foreground",
									)}
								>
									{field.value
										? options.find((option) => option.value === field.value)
												?.label
										: placeholder}
									<ChevronsUpDownIcon className="opacity-50" />
								</Button>
							</FormControl>
						</PopoverTrigger>
						<PopoverContent className="w-full p-0" align="start">
							<Command>
								<CommandInput placeholder="Buscar..." className="h-9" />
								<CommandList>
									<CommandEmpty>Sin resultados.</CommandEmpty>
									<CommandGroup>
										{options.map((option) => (
											<CommandItem
												value={option.label}
												key={option.value}
												onSelect={() => {
													form.setValue(
														name,
														// eslint-disable-next-line @typescript-eslint/no-explicit-any
													option.value as any,
													);
													setOpen(false);
												}}
											>
												{option.label}
												<CheckIcon
													className={cn(
														"ml-auto",
														option.value === field.value
															? "opacity-100"
															: "opacity-0",
													)}
												/>
											</CommandItem>
										))}
									</CommandGroup>
								</CommandList>
							</Command>
						</PopoverContent>
					</Popover>
					{description && <FormDescription>{description}</FormDescription>}
					<FormMessage />
				</FormItem>
			)}
		/>
	);
}
