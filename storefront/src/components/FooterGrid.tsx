'use client';

import { useEffect, useState } from 'react';

const WIDE = '(min-width: 1024px)';

/**
 * Footer column row. The column shares typed in the footer designer only apply on wide screens (lg and up);
 * narrower screens fall back to one or two equal columns, where a 5-way split would be unreadable.
 */
export default function FooterGrid({ columns, children }: { columns: string; children: React.ReactNode }) {
  const [wide, setWide] = useState(false);

  // Matches the server render (equal columns), then adapts after mount.
  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return (
    <div
      className="mx-auto grid max-w-7xl grid-cols-1 items-start gap-x-8 gap-y-8 px-4 py-10 sm:grid-cols-2"
      style={wide ? { gridTemplateColumns: columns } : undefined}
    >
      {children}
    </div>
  );
}
