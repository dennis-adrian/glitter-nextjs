'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  UserProfileType,
  updateProfileWithValidatedData,
} from '@/app/api/users/actions';
import { formatDateOnlyToISO } from '@/app/lib/utils';

import { Button } from '@/app/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/app/components/ui/form';
import { Input } from '@/app/components/ui/input';

const FormSchema = z.object({
  birthdate: z.string(),
});

export default function BirthdateForm({
  profile,
  onSuccess,
}: {
  profile: UserProfileType;
  onSuccess: () => void;
}) {
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      birthdate: formatDateOnlyToISO(profile?.birthdate) || '',
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const result = await updateProfileWithValidatedData(profile.id, {
      ...profile,
      birthdate: new Date(data.birthdate),
    });
    if (result.success) onSuccess();
  });

  return (
    <Form {...form}>
      <form action={action} className="grid items-start gap-4">
        <FormField
          control={form.control}
          name="birthdate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fecha de nacimiento</FormLabel>
              <FormControl>
                <Input
                  type="date"
                  max={formatDateOnlyToISO(new Date())}
                  required
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
