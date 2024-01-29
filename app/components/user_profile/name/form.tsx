import { Button } from '@/app/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const EditNameForm = () => {
  return (
    <form className={'grid items-start gap-4'}>
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input type="email" id="email" defaultValue="shadcn@example.com" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="username">Username</Label>
        <Input id="username" defaultValue="@shadcn" />
      </div>
      <Button type="submit">Guardar cambios</Button>
    </form>
  );
};

export default EditNameForm;
