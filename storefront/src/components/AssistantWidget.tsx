'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import type { AssistantReply, ProductListItem } from '@/lib/types';
import AddToCart from './AddToCart';
import { ChatIcon, CloseIcon, SendIcon } from './icons';
import Price from './Price';
import ProductImage from './ProductImage';
import SmartLink from './SmartLink';
import { Link } from '@/i18n/navigation';

type Msg = { role: 'user' | 'bot'; text: string; products?: ProductListItem[]; links?: { label: string; url: string }[] };

/**
 * Floating shop assistant. It is a local, rule-based helper (product search, deals, suggestions from your purchase
 * history, order status, delivery info), not a generative AI model.
 */
export default function AssistantWidget() {
  const t = useTranslations('assistant');
  const locale = useLocale();
  const cart = useCart((s) => s.items);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && msgs.length === 0) setMsgs([{ role: 'bot', text: t('hello') }]);
  }, [open, msgs.length, t]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [msgs, busy]);

  async function send(raw: string) {
    const message = raw.trim();
    if (!message || busy) return;
    setMsgs((m) => [...m, { role: 'user', text: message }]);
    setText('');
    setBusy(true);
    try {
      const r = await apiFetch<AssistantReply>('/api/assistant', {
        method: 'POST',
        body: JSON.stringify({ message, lang: locale, cart: cart.map((i) => i.productId).slice(0, 30) }),
      });
      setMsgs((m) => [...m, { role: 'bot', text: r.reply, products: r.products, links: r.links }]);
    } catch {
      setMsgs((m) => [...m, { role: 'bot', text: t('error') }]);
    } finally {
      setBusy(false);
    }
  }

  const chips = [
    ['deals', t('chipDeals')],
    ['recommend', t('chipRecommend')],
    ['order', t('chipOrder')],
    ['delivery', t('chipDelivery')],
  ] as const;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 end-3 z-[55] flex h-12 items-center gap-2 rounded-md bg-accent-500 px-4 font-bold text-white shadow-lg hover:bg-accent-600 md:bottom-4"
        aria-label={t('open')}
      >
        <ChatIcon className="h-6 w-6" />
        <span className="hidden sm:inline">{t('title')}</span>
      </button>
    );
  }

  return (
    <section
      role="dialog"
      aria-label={t('title')}
      className="fixed bottom-20 end-3 z-[55] flex h-[min(70vh,560px)] w-[calc(100vw-1.5rem)] max-w-sm flex-col overflow-hidden rounded-md border border-slate-300 bg-white shadow-xl md:bottom-4"
    >
      <header className="flex items-center justify-between bg-brand-700 px-3 py-2.5 text-white">
        <div>
          <p className="font-bold">{t('title')}</p>
          <p className="text-xs text-white/80">{t('subtitle')}</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label={t('close')} className="grid h-8 w-8 place-items-center rounded-md hover:bg-white/15">
          <CloseIcon className="h-5 w-5" />
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3" aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={`max-w-[92%] space-y-2 rounded-md px-3 py-2 text-sm leading-6 ${m.role === 'user' ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white'}`}>
              <p className="whitespace-pre-line">{m.text}</p>

              {m.products && m.products.length > 0 && (
                <ul className="space-y-2">
                  {m.products.map((p) => (
                    <li key={p.id} className="flex gap-2 rounded border border-slate-200 p-2">
                      <Link href={`/products/${encodeURIComponent(p.slug ?? '')}`} onClick={() => setOpen(false)} className="shrink-0">
                        <ProductImage src={p.image} alt={p.name ?? p.sku} className="h-14 w-14 rounded" />
                      </Link>
                      <div className="min-w-0 flex-1 space-y-1">
                        <Link href={`/products/${encodeURIComponent(p.slug ?? '')}`} onClick={() => setOpen(false)} className="line-clamp-1 block text-[13px] font-medium text-slate-800 hover:text-brand-700">
                          {p.name}
                        </Link>
                        <Price price={p.price} salePrice={p.salePrice} />
                        <AddToCart size="compact" productId={p.id} slug={p.slug ?? ''} name={p.name ?? p.sku} price={p.salePrice ?? p.price} image={p.image} stock={p.stock} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {m.links && m.links.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {m.links.map((l) => (
                    <SmartLink key={l.url} href={l.url} className="rounded border border-brand-600 px-2 py-1 text-xs font-bold text-brand-700 hover:bg-brand-50">
                      {l.label}
                    </SmartLink>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <p className="text-xs text-slate-500">{t('thinking')}</p>}
        <div ref={end} />
      </div>

      <div className="flex flex-wrap gap-1.5 border-t border-slate-200 bg-white px-3 pt-2">
        {chips.map(([k, label]) => (
          <button key={k} type="button" disabled={busy} onClick={() => void send(t(`ask.${k}`))} className="rounded-full border border-slate-300 px-2.5 py-1 text-xs hover:border-brand-600 hover:text-brand-700 disabled:opacity-50">
            {label}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void send(text);
        }}
        className="flex gap-2 bg-white p-3"
      >
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder={t('placeholder')} aria-label={t('placeholder')} className="input" />
        <button className="btn px-3" disabled={busy || !text.trim()} aria-label={t('send')}>
          <SendIcon className="h-5 w-5 rtl:-scale-x-100" />
        </button>
      </form>
    </section>
  );
}
