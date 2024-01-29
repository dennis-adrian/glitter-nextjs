'use client';

import { useState } from 'react';
import { useMediaQuery } from '@/hooks/use-media-query';

import { Button } from '@/components/ui/button';
import {
  DrawerDialog,
  DrawerDialogClose,
  DrawerDialogContent, DrawerDialogFooter,
  DrawerDialogHeader,
  DrawerDialogTitle,
  DrawerDialogTrigger
} from '@/components/ui/drawer-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function EditUserModal({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 768px)');

  return (
    <DrawerDialog isDesktop={isDesktop} open={open} onOpenChange={setOpen}>
      <DrawerDialogTrigger isDesktop={isDesktop}>
        {children}
      </DrawerDialogTrigger>
      <DrawerDialogContent className="sm:max-w-[425px]" isDesktop={isDesktop}>
        <DrawerDialogHeader isDesktop={isDesktop}>
          <DrawerDialogTitle isDesktop={isDesktop}>
            Edit profile
          </DrawerDialogTitle>
        </DrawerDialogHeader>

        <div className={`${isDesktop ? '' : 'px-4'}`}>
          <form className={'grid items-start gap-4'}>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                type="email"
                id="email"
                defaultValue="shadcn@example.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" defaultValue="@shadcn" />
            </div>
            <Button type="submit">Save changes</Button>
          </form>
        </div>
        {isDesktop ? null : (
          <DrawerDialogFooter isDesktop={isDesktop} className="pt-2">
            <DrawerDialogClose isDesktop={isDesktop}>
              <Button variant="outline">Cancel</Button>
            </DrawerDialogClose>
          </DrawerDialogFooter>
        )}
      </DrawerDialogContent>
    </DrawerDialog>
  );
}
