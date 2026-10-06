'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

type InstallEvent = Event & { prompt: () => Promise<void> };

/** Registers the service worker (production only) and shows an "install app" button when available. */
export default function PwaRegister() {
  const t = useTranslations('common');
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (!installEvent) return null;
  return (
    <button
      className="btn fixed bottom-4 start-4 z-50 shadow-lg"
      onClick={async () => {
        await installEvent.prompt();
        setInstallEvent(null);
      }}
    >
      {t('install')}
    </button>
  );
}
