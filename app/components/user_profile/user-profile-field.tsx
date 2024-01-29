import { HTMLAttributes } from 'react';

import { FilePenLineIcon } from 'lucide-react';

import { Button } from '@/app/components/ui/button';

export function UserProfileFieldButton({ disabled = false }: { disabled?: boolean }) {
  return (
    <Button disabled={disabled} variant="ghost">
      <FilePenLineIcon className="w-4 h-4 mr-1" />
      Editar
    </Button>
  );
}

type UserProfileFieldProps = {
  editable?: boolean;
  label: string;
  value?: string | null;
} & HTMLAttributes<HTMLDivElement>;

export function UserProfileField({
  children,
  label,
  value,
}: UserProfileFieldProps) {
  value = value || 'No especificado';
  return (
    <div className="w-full flex justify-between">
      <div>
        <h3 className="font-bold">{label}</h3>
        <span className="text-muted-foreground">{value}</span>
      </div>
      {children}
    </div>
  );
}
