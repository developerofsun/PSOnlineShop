'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiFetch, useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { useFavorites } from '@/lib/favorites';
import type { RecommendationSection } from '@/lib/types';
import ProductCard from './ProductCard';

/**
 * Personalized rows: "buy again" and "for you" use the customer's order history (when logged in) plus the cart and
 * favorites; "popular" is the fallback for everyone. Nothing leaves your own server.
 */
export default function Recommendations({ limit = 5 }: { limit?: number }) {
  const t = useTranslations('recs');
  const locale = useLocale();
  const cart = useCart((s) => s.items);
  const favs = useFavorites((s) => s.ids);
  const token = useAuth((s) => s.token);
  const [sections, setSections] = useState<RecommendationSection[]>([]);

  const seeds = useMemo(() => [...new Set([...cart.map((i) => i.productId), ...favs])].slice(0, 30).join(','), [cart, favs]);

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      apiFetch<RecommendationSection[]>(`/api/recommendations?lang=${locale}&limit=${limit}&seeds=${seeds}`, { signal: ctrl.signal })
        .then(setSections)
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [seeds, locale, limit, token]);

  if (sections.length === 0) return null;

  return (
    <div className="space-y-8">
      {sections.map((s) => (
        <section key={s.key}>
          <div className="section-title mb-4">
            <h2>{t(s.key)}</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {s.items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
