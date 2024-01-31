import { Londrina_Solid, Roboto } from 'next/font/google';
import localFont from 'next/font/local';

export const londrinaSolid = Londrina_Solid({
  subsets: ['latin'],
  weight: ['300'],
});

export const roboto = Roboto({
  subsets: ['latin'],
  weight: ['400'],
});

export const junegull = localFont({
  src: '../fonts/junegull.otf',
});
