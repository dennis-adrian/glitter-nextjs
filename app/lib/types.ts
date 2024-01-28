import { buttonVariants } from '@/app/components/ui/button';
import { VariantProps } from 'class-variance-authority';

// TODO: Remove this, I could use asChild from radix
// Some of radix components (specially triggers) are buttons under the hood,
// this type is meant to have them use the button component variants
export type ExtendedProps<T extends React.ElementType> =
  React.ComponentPropsWithRef<T> & VariantProps<typeof buttonVariants>;
