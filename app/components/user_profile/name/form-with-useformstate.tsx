'use client';

import { updateProfile } from '@/app/api/users/actions';
import { ProfileType } from '@/app/api/users/definitions';

import { Button } from '@/app/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

const EditNameForm = ({
  profile,
  onSuccess,
}: {
  profile: ProfileType;
  onSuccess: () => void;
}) => {
  const initialState = {
    message: '',
    errors: {},
  };
  const updateProfileWithId = updateProfile.bind(null, profile.id);
  const [state, dispatch] = useFormState(updateProfileWithId, initialState);
  const { pending } = useFormStatus();

  useEffect(() => {
    if (state) return;
    onSuccess();
  }, [state, onSuccess]);

  return (
    <form action={dispatch} className={'grid items-start gap-4'}>
      <div className="grid">
        <Label htmlFor="firstName">Nombre</Label>
        <Input
          className="mt-2"
          id="firstName"
          defaultValue={profile.firstName || ''}
          name="firstName"
          placeholder="Ingresa tu nombre"
          required
          type="text"
          aria-describedby="firstName-error"
        />
        <div id="firstName-error" aria-live="polite" aria-atomic="true">
          {state?.errors?.firstName &&
            state?.errors.firstName.map((error: string) => (
              <p className="mt-2 text-sm text-red-500" key={error}>
                {error}
              </p>
            ))}
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="lastName">Apellido</Label>
        <Input
          id="lastName"
          defaultValue={profile.lastName || ''}
          name="lastName"
          placeholder="Ingresa tu apellido"
          required
          type="text"
          aria-describedby="lastName-error"
        />
      </div>
      <Button disabled={pending} aria-disabled={pending} type="submit">Guardar cambios</Button>
    </form>
  );
};

export default EditNameForm;
