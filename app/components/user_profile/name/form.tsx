'use client';

import { UserProfileType, updateProfile } from '@/app/api/users/actions';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { HTMLAttributes } from 'react';

const EditNameForm = ({
  profile,
  onSubmit,
}: { profile: UserProfileType } & HTMLAttributes<HTMLFormElement>) => {
  const initialState = {
    message: null,
    errors: {},
  };

  const updateUserWithId = updateProfile.bind(null, profile.id);
  // const [state, dispatch] = useFormState(updateUserWithId, initialState);
  // const [state, dispatch] = useFormState(createExample, initialState);

  return (
    <form
      action={updateUserWithId}
      className={'grid items-start gap-4'}
      onSubmit={onSubmit}
    >
      <div className="grid gap-2">
        <Label htmlFor="firstName">Nombre</Label>
        <Input
          id="firstName"
          defaultValue={profile.firstName || ''}
          name="firstName"
          placeholder="Ingresa tu nombre"
          type="text"
          // aria-describedby="amount-error"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="lastName">Apellido</Label>
        <Input
          id="lastName"
          defaultValue={profile.lastName || ''}
          name="lastName"
          placeholder="Ingresa tu apellido"
          type="text"
        />
      </div>
      <Button type="submit">Guardar cambios</Button>
    </form>
  );
};

export default EditNameForm;
