'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  UserProfileType,
  updateProfileWithValidatedData,
} from '@/app/api/users/actions';

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
import { Badge } from '@/app/components/ui/badge';

const phoneRegex = new RegExp(/^\d{8}$/);
const FormSchema = z.object({
  phoneNumber: z
    .string()
    .regex(phoneRegex, 'Número de teléfono inválido. Necesita tener 8 dígitos'),
});

export default function EditNameForm({
  profile,
  onSuccess,
}: {
  profile: UserProfileType;
  onSuccess: () => void;
}) {
  const defaultValue = profile.phoneNumber ? `+591 ${profile.phoneNumber}` : '';
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      phoneNumber: defaultValue,
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
          name="phoneNumber"
          render={({ field }) => (
            <FormItem className="grid gap-2">
              <FormLabel>Número de teléfono</FormLabel>
              <FormControl>
                <div className="flex items-center">
                  <Badge className="mr-2 text-sm" variant="outline">
                    +591
                  </Badge>
                  <Input type="tel" placeholder="xxxxxxxx" {...field} />
                </div>
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
