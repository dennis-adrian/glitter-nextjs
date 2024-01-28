'use client';

import { useState, useEffect } from 'react';

import { redirect } from 'next/navigation';

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

export function RedirectDrawer() {
  const [counter, setCounter] = useState(5);

  useEffect(() => {
    const interval = setInterval(() => {
      setCounter((counter) => counter - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (counter <= 0) return redirect('/sign_up');

  return (
    <Drawer open>
      <DrawerContent>
        <div className="mx-auto w-full max-w-sm">
          <DrawerHeader>
            <DrawerTitle className="text-center">
              ¡Ups! Tuvimos un error
            </DrawerTitle>
          </DrawerHeader>
          <div className="p-4">
            <h1 className="text-center mb-8">
              No pudimos encontrar o crear tu perfil. Te redirigiremos para que
              vuelvas a intentarlo
            </h1>
            <div className="text-7xl font-bold tracking-tighter text-center">
              {counter}
            </div>
            <div className="mt-3 h-[32px]"></div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
