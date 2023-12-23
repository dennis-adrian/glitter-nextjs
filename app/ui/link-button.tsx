import Link from 'next/link';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import Button from '@/app/ui/button';

type LinkButtonProps = {
  children: React.ReactNode;
  href: string;
  icon?: IconDefinition;
  target?: HTMLAnchorElement['target'];
};

const LinkButton = ({ children, icon, href, target }: LinkButtonProps) => {
  return (
    <Link href={href} target={target}>
      <Button icon={icon}>{children}</Button>
    </Link>
  );
};

export default LinkButton;
