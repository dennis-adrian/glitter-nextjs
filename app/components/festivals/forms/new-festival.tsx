"use client";

import { Button } from "@/app/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { createFestival } from "@/app/lib/festivals/actions";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const FormSchema = z.object({
    name: z.string().min(1, "Required"),
    status: z.enum(['draft', 'published', 'active', 'archived']).default('draft'),
    mapsVersion: z.enum(['v1', 'v2', 'v3']).default('v1'),
    publicRegistration: z.boolean().default(false),
    eventDayRegistration: z.boolean().default(false),
    festivalType: z.enum(['glitter', 'twinkler', 'festicker']).default('glitter'),

    description: z.string().optional(),
    address: z.string().optional(),
    locationLabel: z.string().optional(),
    locationUrl: z.string().url().optional().or(z.literal('')),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    generalMapUrl: z.string().optional(),
    mascotUrl: z.string().optional(),
    illustrationPaymentQrCodeUrl: z.string().optional(),
    gastronomyPaymentQrCodeUrl: z.string().optional(),
    entrepreneurshipPaymentQrCodeUrl: z.string().optional(),
    illustrationStandUrl: z.string().optional(),
    gastronomyStandUrl: z.string().optional(),
    entrepreneurshipStandUrl: z.string().optional(),
    festivalCode: z.string().optional(),
    festivalBannerUrl: z.string().optional(),
});

export default function NewFestivalForm({ onSuccess }: { onSuccess: () => void }) {
    const router = useRouter();
    const form = useForm<z.infer<typeof FormSchema>>({
        resolver: zodResolver(FormSchema),
        defaultValues: {
            name: "",
            status: "draft",
            mapsVersion: "v1",
            publicRegistration: false,
            eventDayRegistration: false,
            festivalType: "glitter",
        }
    });

    const onSubmit = form.handleSubmit(async (data) => {
        const festivalData = {
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
            reservationsStartDate: new Date(),
        };

        const result = await createFestival(festivalData);

        if (result.success) {
            toast.success(result.message);
            onSuccess();
            router.push("/dashboard/festivals");
        } else {
            toast.error(result.message);
        }
    });

    return (
        <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-6 max-w-3xl">
                {/* Basic Information Section */}
                <div className="space-y-4 p-4 border rounded-lg">
                    <h3 className="font-medium">Informacion Básica</h3>

                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Nombre de Festival</FormLabel>
                                <FormControl>
                                    <Input {...field} />
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
                                    <Textarea {...field} />
                                </FormControl>
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
                                <FormControl>
                                    <select {...field} className="border rounded p-2 w-full">
                                        <option value="glitter">Glitter</option>
                                        <option value="twinkler">Twinkler</option>
                                        <option value="festicker">Festicker</option>
                                    </select>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                {/* Location Information Section */}
                <div className="space-y-4 p-4 border rounded-lg">
                    <h3 className="font-medium">Informacion de la Ubicación</h3>

                    <FormField
                        control={form.control}
                        name="address"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Dirección</FormLabel>
                                <FormControl>
                                    <Input
                                        {...field}
                                        value={field.value || ''}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="locationLabel"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Etiqueta de Dirección</FormLabel>
                                <FormControl>
                                    <Input {...field}
                                        value={field.value || ''}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="locationUrl"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>URL de Dirección</FormLabel>
                                <FormControl>
                                    <Input
                                        {...field}
                                        value={field.value || ''}
                                        placeholder="https://example.com"
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                {/* Dates Section */}
                <div className="space-y-4 p-4 border rounded-lg">
                    <h3 className="font-medium">Fechas</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="startDate"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Fecha Inicio</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="date"
                                            {...field}
                                            value={field.value?.toISOString().split('T')[0] || ''}
                                            onChange={e => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                                        />
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
                                    <FormLabel>Fecha Fin</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="date"
                                            {...field}
                                            value={field.value?.toISOString().split('T')[0] || ''}
                                            onChange={e => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </div>

                {/* Hidden Fields */}
                {['status', 'mapsVersion', 'publicRegistration', 'eventDayRegistration'].map((field) => (
                    <FormField
                        key={field}
                        control={form.control}
                        name={field as any}
                        render={({ field }) => <input type="hidden" {...field} />}
                    />
                ))}

                <Button type="submit" size="lg" className="w-full md:w-auto">
                    Agregar Festival
                </Button>
            </form>
        </Form>
    );
}