'use client';

import { useState, useEffect } from 'react';

import { useRouter } from 'next/navigation';

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { useClerk } from '@clerk/nextjs';

type RedirectDrawerProps = {
  counterValue?: number;
  title?: string;
  message?: string;
};

export function RedirectDrawer({
  counterValue,
  title,
  message,
}: RedirectDrawerProps) {
  const { signOut } = useClerk();
  const router = useRouter();
  const [counter, setCounter] = useState(counterValue || 5);

  useEffect(() => {
    const interval = setInterval(() => {
      setCounter((counter) => {
        if (counter <= 0) {
          return 0;
        }

        return counter - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (counter <= 1) {
    signOut(() => router.push('/sign_up'));
  }

  return (
    <Drawer open>
      <DrawerContent>
        <div className="mx-auto w-full max-w-sm">
          <DrawerHeader>
            <DrawerTitle className="text-center">{title}</DrawerTitle>
          </DrawerHeader>
          <div className="p-4">
            <h1 className="text-center mb-8">{message}</h1>
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
