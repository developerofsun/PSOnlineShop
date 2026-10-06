'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { CategoryItem } from '@/lib/types';
import { ChevronIcon, CubeIcon, MenuIcon } from './icons';

/** Category bar under the header: an "All categories" mega menu plus quick links to the top categories. */
export default function CategoryNav({ categories, shop3d = false }: { categories: CategoryItem[]; shop3d?: boolean }) {
  const t = useTranslations('common');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const roots = categories.filter((c) => c.parentId == null);
  const kids = (id: number) => categories.filter((c) => c.parentId === id);
  const href = (c: CategoryItem) => `/products?categories=${encodeURIComponent(c.slug ?? '')}`;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (roots.length === 0) return null;

  return (
    <nav className="border-b border-slate-200 bg-white" aria-label={t('allCategories')}>
      <div ref={box} className="relative mx-auto flex max-w-7xl items-stretch gap-1 px-4">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex shrink-0 items-center gap-2 border-e border-slate-200 py-2.5 pe-4 text-sm font-bold text-brand-700 hover:text-brand-800"
        >
          <MenuIcon className="h-5 w-5" />
          {t('allCategories')}
        </button>

        <ul className="flex flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap ps-2 text-sm">
          {roots.slice(0, 10).map((c) => (
            <li key={c.id}>
              <Link href={href(c)} className="block rounded px-3 py-2.5 text-slate-700 hover:bg-brand-50 hover:text-brand-700">
                {c.name}
              </Link>
            </li>
          ))}
        </ul>

        {shop3d && (
          <Link href="/shop3d" className="flex shrink-0 items-center gap-1.5 border-s border-slate-200 ps-4 text-sm font-bold text-accent-600 hover:text-accent-500">
            <CubeIcon className="h-5 w-5" />
            {t('shop3d')}
          </Link>
        )}

        {open && (
          <div className="absolute inset-x-4 top-full z-40 max-h-[70vh] overflow-y-auto border border-slate-200 bg-white p-4 shadow-lg">
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-3 lg:grid-cols-4">
              {roots.map((c) => (
                <div key={c.id}>
                  <Link href={href(c)} onClick={() => setOpen(false)} className="mb-1 flex items-center gap-1 font-bold text-brand-700 hover:underline">
                    {c.name}
                    <ChevronIcon className="h-4 w-4 rtl:rotate-180" />
                  </Link>
                  <ul className="space-y-1 text-sm">
                    {kids(c.id).map((k) => (
                      <li key={k.id}>
                        <Link href={href(k)} onClick={() => setOpen(false)} className="text-slate-600 hover:text-brand-700 hover:underline">
                          {k.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
