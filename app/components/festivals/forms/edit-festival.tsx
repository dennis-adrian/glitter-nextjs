'use client';

import { Button } from "@/app/components/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/app/components/ui/select";
import { Textarea } from "@/app/components/ui/textarea";
import { updateFestival } from "@/app/data/festivals/actions";
import { FestivalBase, FestivalWithDates } from "@/app/data/festivals/definitions";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { useState } from "react";

const formSchema = z.object({
    name: z.string().min(2, {
        message: "El nombre debe tener al menos 2 caracteres",
    }),
    description: z.string().optional().nullable(),
    status: z.enum(["draft", "published", "active", "archived"]),
    festivalType: z.enum(["glitter", "twinkler", "festicker"]),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
        message: "Formato de fecha inválido (YYYY-MM-DD)",
    }),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
        message: "Formato de fecha inválido (YYYY-MM-DD)",
    }),
    locationLabel: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
});

export function EditFestivalForm({
    festival,
    onSuccess
}: {
    festival: FestivalWithDates;
    onSuccess: () => void;
}) {
    const [isLoading, setIsLoading] = useState(false);
    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: festival.name,
            description: festival.description || "",
            status: festival.status,
            festivalType: festival.festivalType,
            startDate: festival.festivalDates[0]?.startDate.toISOString().split('T')[0] || "",
            endDate: festival.festivalDates[0]?.endDate.toISOString().split('T')[0] || "",
            locationLabel: festival.locationLabel || "",
            address: festival.address || "",
        },
    });

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setIsLoading(true);
        const toastId = toast.loading("Actualizando festival...");
        
        try {
            const currentFestival = festival;
            
            const festivalData: FestivalBase = {
                id: currentFestival.id,
                name: values.name,
                description: values.description || null,
                status: values.status,
                festivalType: values.festivalType,
                startDate: new Date(values.startDate),
                endDate: new Date(values.endDate),
                locationLabel: values.locationLabel || null,
                address: values.address || null,
                
                locationUrl: currentFestival.locationUrl,
                mapsVersion: currentFestival.mapsVersion,
                publicRegistration: currentFestival.publicRegistration,
                eventDayRegistration: currentFestival.eventDayRegistration,
                reservationsStartDate: currentFestival.reservationsStartDate,
                generalMapUrl: currentFestival.generalMapUrl,
                mascotUrl: currentFestival.mascotUrl,
                illustrationPaymentQrCodeUrl: currentFestival.illustrationPaymentQrCodeUrl,
                gastronomyPaymentQrCodeUrl: currentFestival.gastronomyPaymentQrCodeUrl,
                entrepreneurshipPaymentQrCodeUrl: currentFestival.entrepreneurshipPaymentQrCodeUrl,
                illustrationStandUrl: currentFestival.illustrationStandUrl,
                gastronomyStandUrl: currentFestival.gastronomyStandUrl,
                entrepreneurshipStandUrl: currentFestival.entrepreneurshipStandUrl,
                festivalCode: currentFestival.festivalCode,
                festivalBannerUrl: currentFestival.festivalBannerUrl,
                updatedAt: new Date(),
                createdAt: currentFestival.createdAt,
            };
        
            const result = await updateFestival(festivalData);
        
            if (result.success) {
                toast.success("Festival actualizado correctamente", { id: toastId });
                onSuccess();
            } else {
                toast.error("Error al actualizar el festival", { id: toastId });
            }
        } catch (error) {
            console.error("Error updating festival:", error);
            toast.error("Ocurrió un error al actualizar el festival", { id: toastId });
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Nombre</FormLabel>
                            <FormControl>
                                <Input placeholder="Nombre del festival" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Descripción</FormLabel>
                            <FormControl>
                                <Textarea placeholder="Descripción del festival" {...field}  value={field.value ?? ""} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="startDate"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Fecha de inicio</FormLabel>
                                <FormControl>
                                    <Input type="date" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="endDate"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Fecha de fin</FormLabel>
                                <FormControl>
                                    <Input type="date" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Estado</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecciona un estado" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="draft">Borrador</SelectItem>
                                    <SelectItem value="published">Publicado</SelectItem>
                                    <SelectItem value="active">Activo</SelectItem>
                                    <SelectItem value="archived">Archivado</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="festivalType"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Tipo de Festival</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecciona un tipo" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="glitter">Glitter</SelectItem>
                                    <SelectItem value="twinkler">Twinkler</SelectItem>
                                    <SelectItem value="festicker">Festicker</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="locationLabel"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Ubicación</FormLabel>
                            <FormControl>
                                <Input placeholder="Ej: Centro de convenciones" {...field} value={field.value ?? ""} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Dirección</FormLabel>
                            <FormControl>
                                <Input placeholder="Dirección completa" {...field} value={field.value ?? ""}/>
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Actualizando...
                        </>
                    ) : "Actualizar festival"}
                </Button>
            </form>
        </Form>
    );
}