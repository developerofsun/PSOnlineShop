'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useUi } from '@/lib/ui';
import { CloseIcon } from './icons';
import SearchBox from './SearchBox';

/** Full-screen search for phones: opened from the magnifier next to the account icon in the header. */
export default function SearchDialog() {
  const t = useTranslations('common');
  const open = useUi((s) => s.searchOpen);
  const setOpen = useUi((s) => s.setSearchOpen);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label={t('search')} className="fixed inset-0 z-[60] overflow-y-auto bg-white p-3 md:hidden">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <SearchBox autoFocus inline onDone={() => setOpen(false)} />
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t('close')}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
