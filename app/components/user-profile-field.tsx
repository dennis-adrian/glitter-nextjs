import { Button } from '@/app/components/ui/button';
import { FilePenLineIcon } from 'lucide-react';

type UserProfileFieldProps = {
  editable?: boolean;
  label: string;
  value?: string | null;
};

export function UserProfileField({
  editable = true,
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
      <Button disabled={!editable} variant="ghost">
        <FilePenLineIcon className="w-4 h-4 mr-1" />
        Editar
      </Button>
    </div>
  );
}
