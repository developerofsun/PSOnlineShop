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

type Msg = {
  id: number;
  role: 'user' | 'bot';
  text: string;
  at: number;
  products?: ProductListItem[];
  links?: { label: string; url: string }[];
  /** The reply is still being "typed out" on screen; the cards and links wait until it is done. */
  streaming?: boolean;
};

const reduceMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Floating shop assistant. It is a local, rule-based helper (product search, deals, suggestions from your purchase
 * history, order status, delivery info), not a generative AI model. On screen it behaves like a live chat: an online
 * presence, a typing indicator, replies that type themselves out and a friendly offer of help after a few seconds.
 */
export default function AssistantWidget() {
  const t = useTranslations('assistant');
  const locale = useLocale();
  const cart = useCart((s) => s.items);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [streamId, setStreamId] = useState<number | null>(null);
  const [shown, setShown] = useState(0);
  const end = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const everOpened = useRef(false);
  const nudgeDismissed = useRef(false);
  const nextId = () => ++seq.current;

  // ---- open / close
  function openChat() {
    everOpened.current = true;
    nudgeDismissed.current = true;
    setNudge(false);
    setOpen(true);
  }
  function closeChat() {
    setOpen(false);
  }
  function dismissNudge() {
    nudgeDismissed.current = true;
    setNudge(false);
  }

  // Greeting, once the panel is opened for the first time.
  useEffect(() => {
    if (open) setMsgs((m) => (m.length === 0 ? [{ id: nextId(), role: 'bot', text: t('hello'), at: Date.now() }] : m));
  }, [open, t]);

  // The assistant "notices" you are browsing and offers a hand, once per visit.
  useEffect(() => {
    if (open || everOpened.current || nudgeDismissed.current) return;
    const id = setTimeout(() => setNudge(true), 7000);
    return () => clearTimeout(id);
  }, [open]);

  // Focus the message field when the panel opens; Escape closes it.
  useEffect(() => {
    if (!open) return;
    const focus = setTimeout(() => inputRef.current?.focus(), 80);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(focus);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Keep the newest line in view (also while a reply is typing).
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [msgs, busy, shown]);

  // Typewriter: reveal the newest bot reply a couple of characters at a time, then let the cards pop in.
  useEffect(() => {
    if (streamId === null) return;
    const msg = msgs.find((m) => m.id === streamId);
    if (!msg) {
      setStreamId(null);
      return;
    }
    const chars = Array.from(msg.text);
    if (reduceMotion()) {
      if (shown < chars.length) {
        setShown(chars.length);
        return;
      }
    } else if (shown < chars.length) {
      const id = setTimeout(() => setShown((s) => Math.min(chars.length, s + 2)), 16);
      return () => clearTimeout(id);
    }
    const done = setTimeout(() => {
      setMsgs((m) => m.map((x) => (x.id === streamId ? { ...x, streaming: false } : x)));
      setStreamId(null);
    }, 220);
    return () => clearTimeout(done);
  }, [streamId, shown, msgs]);

  async function send(raw: string) {
    const message = raw.trim();
    if (!message || busy) return;
    setNudge(false);
    setMsgs((m) => [...m, { id: nextId(), role: 'user', text: message, at: Date.now() }]);
    setText('');
    setBusy(true);
    try {
      // A short floor on the wait, so the typing indicator is visible instead of flashing.
      const [r] = await Promise.all([
        apiFetch<AssistantReply>('/api/assistant', {
          method: 'POST',
          body: JSON.stringify({ message, lang: locale, cart: cart.map((i) => i.productId).slice(0, 30) }),
        }),
        wait(550),
      ]);
      const botId = nextId();
      setMsgs((m) => [
        ...m,
        { id: botId, role: 'bot', text: r.reply, at: Date.now(), products: r.products, links: r.links, streaming: true },
      ]);
      setShown(0);
      setStreamId(botId);
    } catch {
      setMsgs((m) => [...m, { id: nextId(), role: 'bot', text: t('error'), at: Date.now() }]);
    } finally {
      setBusy(false);
    }
  }

  const time = (at: number) =>
    new Date(at).toLocaleTimeString(locale === 'fa' ? 'fa-IR' : 'en-US', { hour: '2-digit', minute: '2-digit' });

  const chips = [
    ['deals', t('chipDeals')],
    ['recommend', t('chipRecommend')],
    ['order', t('chipOrder')],
    ['delivery', t('chipDelivery')],
  ] as const;

  const launcher = (
    <button
      type="button"
      onClick={openChat}
      className="flex h-12 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 font-semibold text-brand-700 shadow-[0_4px_14px_-4px_rgba(47,45,40,.3)] transition-colors hover:border-brand-600"
      aria-label={t('open')}
    >
      <span className="relative grid h-7 w-7 place-items-center">
        <ChatIcon className="h-6 w-6" />
        <span className="absolute -end-1 -top-1 flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-600 opacity-70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-600 ring-2 ring-white" />
        </span>
      </span>
      <span className="hidden sm:inline">{t('title')}</span>
      {nudge && (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent-500 px-1 text-[11px] font-bold text-slate-900">
          1
        </span>
      )}
    </button>
  );

  if (!open) {
    return (
      <div className="fixed bottom-20 end-3 z-[55] flex flex-col items-end gap-2 md:bottom-4">
        {nudge && (
          <div
            role="status"
            className="relative w-[min(78vw,17rem)] animate-assistant-in rounded-2xl border border-slate-200 bg-white p-3 text-start shadow-[0_12px_30px_-12px_rgba(47,45,40,.35)]"
          >
            <button
              type="button"
              onClick={dismissNudge}
              aria-label={t('close')}
              className="absolute end-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
            <p className="pe-6 text-sm font-bold text-slate-800">{t('nudgeTitle')}</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">{t('nudgeText')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={openChat} className="btn px-3 py-1.5 text-xs">
                {t('nudgeYes')}
              </button>
              <button
                type="button"
                onClick={dismissNudge}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-400"
              >
                {t('nudgeNo')}
              </button>
            </div>
          </div>
        )}
        {launcher}
      </div>
    );
  }

  return (
    <section
      role="dialog"
      aria-label={t('title')}
      className="fixed bottom-20 end-3 z-[55] flex h-[min(70vh,560px)] w-[calc(100vw-1.5rem)] max-w-sm animate-assistant-in flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-[0_16px_40px_-12px_rgba(47,45,40,.35)] md:bottom-4"
    >
      <header className="flex items-center justify-between bg-brand-800 px-4 py-3 text-white">
        <div className="flex items-center gap-2.5">
          <span className="relative grid h-9 w-9 place-items-center rounded-full bg-white/15 ring-1 ring-white/25">
            <ChatIcon className="h-5 w-5" />
            <span className="absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full bg-brand-500 ring-2 ring-brand-800" />
          </span>
          <div>
            <p className="font-bold leading-5">{t('title')}</p>
            <p className="flex items-center gap-1 text-xs text-white/85">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-80" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-500" />
              </span>
              {t('online')}
            </p>
          </div>
        </div>
        <button type="button" onClick={closeChat} aria-label={t('close')} className="grid h-8 w-8 place-items-center rounded-md hover:bg-white/15">
          <CloseIcon className="h-5 w-5" />
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3" aria-live="polite">
        {msgs.map((m) => {
          const streaming = m.id === streamId;
          const visible = streaming ? Array.from(m.text).slice(0, shown).join('') : m.text;
          return (
            <div key={m.id} className={`animate-assistant-in ${m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}`}>
              <div className="max-w-[92%] space-y-2">
                <div
                  className={`space-y-1.5 rounded-2xl px-3.5 py-2 text-sm leading-6 ${
                    m.role === 'user' ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white'
                  }`}
                >
                  {visible && <p className="whitespace-pre-line">{visible}</p>}
                  {streaming && <span className="inline-block h-4 w-[2px] animate-pulse bg-brand-600 align-middle" aria-hidden />}
                  {!streaming && <p className={`text-[10px] ${m.role === 'user' ? 'text-white/70' : 'text-slate-400'}`}>{time(m.at)}</p>}
                </div>

                {!streaming && m.products && m.products.length > 0 && (
                  <ul className="space-y-2">
                    {m.products.map((p) => (
                      <li key={p.id} className="flex animate-assistant-in gap-2 rounded border border-slate-200 bg-white p-2">
                        <Link href={`/products/${encodeURIComponent(p.slug ?? '')}`} onClick={closeChat} className="shrink-0">
                          <ProductImage src={p.image} alt={p.name ?? p.sku} className="h-14 w-14 rounded" />
                        </Link>
                        <div className="min-w-0 flex-1 space-y-1">
                          <Link
                            href={`/products/${encodeURIComponent(p.slug ?? '')}`}
                            onClick={closeChat}
                            className="line-clamp-1 block text-[13px] font-medium text-slate-800 hover:text-brand-700"
                          >
                            {p.name}
                          </Link>
                          <Price price={p.price} salePrice={p.salePrice} />
                          <AddToCart
                            size="compact"
                            productId={p.id}
                            slug={p.slug ?? ''}
                            name={p.name ?? p.sku}
                            price={p.salePrice ?? p.price}
                            image={p.image}
                            stock={p.stock}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {!streaming && m.links && m.links.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {m.links.map((l) => (
                      <SmartLink
                        key={l.url}
                        href={l.url}
                        className="rounded-full border border-brand-600 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                      >
                        {l.label}
                      </SmartLink>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {busy && streamId === null && (
          <div className="flex animate-assistant-in justify-start">
            <div
              role="status"
              aria-label={t('typing')}
              className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-white px-3.5 py-3"
            >
              <span className="h-1.5 w-1.5 animate-typing rounded-full bg-slate-400 [animation-delay:-0.32s]" />
              <span className="h-1.5 w-1.5 animate-typing rounded-full bg-slate-400 [animation-delay:-0.16s]" />
              <span className="h-1.5 w-1.5 animate-typing rounded-full bg-slate-400" />
            </div>
          </div>
        )}
        <div ref={end} />
      </div>

      <div className="flex flex-wrap gap-1.5 border-t border-slate-200 bg-white px-3 pt-2">
        {chips.map(([k, label]) => (
          <button
            key={k}
            type="button"
            disabled={busy}
            onClick={() => void send(t(`ask.${k}`))}
            className="rounded-full border border-slate-300 px-2.5 py-1 text-xs hover:border-brand-600 hover:text-brand-700 disabled:opacity-50"
          >
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
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          placeholder={t('placeholder')}
          aria-label={t('placeholder')}
          className="input"
        />
        <button className="btn px-3" disabled={busy || !text.trim()} aria-label={t('send')}>
          <SendIcon className="h-5 w-5 rtl:-scale-x-100" />
        </button>
      </form>
    </section>
  );
}
