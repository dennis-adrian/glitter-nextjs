'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { updateProfileWithValidatedData } from '@/app/api/users/actions';
import { ProfileType } from '@/app/api/users/definitions';

import { Input } from '@/app/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

const FormSchema = z.object({
  firstName: z
    .string()
    .min(2, { message: 'El nombre tiene que tener al menos dos letras' }),
  lastName: z
    .string()
    .min(2, { message: 'El apellido tiene que tener al menos dos letras' }),
});

export default function EditNameForm({
  profile,
  onSuccess,
}: {
  profile: ProfileType;
  onSuccess: () => void;
}) {
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const result = await updateProfileWithValidatedData(profile.id, {
      ...profile,
      ...data,
    });
    if (result.success) onSuccess();
  });

  return (
    <Form {...form}>
      <form action={action} className="grid items-start gap-4">
        <FormField
          control={form.control}
          name="firstName"
          render={({ field }) => (
            <FormItem className="grid gap-2">
              <FormLabel>Nombre</FormLabel>
              <FormControl>
                <Input type="text" placeholder="Ingresa tu nombre" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="lastName"
          render={({ field }) => (
            <FormItem className="grid gap-2">
              <FormLabel>Apellido</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  placeholder="Ingresa tu apellido"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Guardar cambios</Button>
      </form>
    </Form>
  );
}
