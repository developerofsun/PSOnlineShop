import type { SVGProps } from 'react';

const base = (p: SVGProps<SVGSVGElement>) => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...p,
});

export const HeartIcon = ({ filled, ...p }: SVGProps<SVGSVGElement> & { filled?: boolean }) => (
  <svg {...base(p)} fill={filled ? 'currentColor' : 'none'}>
    <path d="M12 21s-7-4.6-9.3-9.1C1.1 8.7 2.9 5 6.4 5c2 0 3.4 1.1 4.1 2.3h3C14.2 6.1 15.6 5 17.6 5c3.5 0 5.3 3.7 3.7 6.9C19 16.4 12 21 12 21z" />
  </svg>
);

export const CompareIcon = ({ active, ...p }: SVGProps<SVGSVGElement> & { active?: boolean }) => (
  <svg {...base(p)}>
    <path d="M7 4v16M17 4v16M3 8l4-4 4 4M13 16l4 4 4-4" strokeWidth={active ? 2.4 : 1.8} />
  </svg>
);

export const CartIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 4h2l2.4 11h10.2L20 7H6.2" />
    <circle cx="9" cy="19.5" r="1.3" />
    <circle cx="17" cy="19.5" r="1.3" />
  </svg>
);

export const SearchIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </svg>
);

export const UserIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
  </svg>
);

export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} strokeWidth={2.4}>
    <path d="M5 12.5l4.2 4.2L19 7" />
  </svg>
);

export const FilterIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 5h16M7 12h10M10 19h4" />
  </svg>
);

export const ChevronIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export const PlusIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} strokeWidth={2.2}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const MinusIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} strokeWidth={2.2}>
    <path d="M5 12h14" />
  </svg>
);

export const TrashIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3" />
  </svg>
);

export const PinIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z" />
    <circle cx="12" cy="10" r="2.4" />
  </svg>
);

export const MenuIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

export const CloseIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const ChatIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 5h16v11H9l-5 4V5z" />
    <path d="M8 10h8M8 13h5" />
  </svg>
);

export const CubeIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
    <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
  </svg>
);

export const SendIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 12l16-8-6 16-3-7-7-1z" />
  </svg>
);
