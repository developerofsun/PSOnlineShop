import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';

/** Site-relative links get the current locale prefix; external links open in a new tab. Anything else renders plain. */
export default function SmartLink({
  href,
  className,
  children,
}: {
  href: string | null | undefined;
  className?: string;
  children: ReactNode;
}) {
  if (!href) return <div className={className}>{children}</div>;
  if (href.startsWith('/') && !href.startsWith('//')) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  if (/^https?:\/\//i.test(href)) {
    return (
      <a href={href} className={className} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return <div className={className}>{children}</div>;
}
