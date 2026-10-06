import { Tabs } from 'antd';
import type { ReactNode } from 'react';
import { LANGS } from '../lib/types';

/** One tab per language. forceRender keeps the fields of hidden tabs in the surrounding Form. */
export default function LangTabs({ children }: { children: (code: string, dir: 'rtl' | 'ltr') => ReactNode }) {
  return (
    <Tabs
      size="small"
      items={LANGS.map((l) => ({
        key: l.code,
        label: l.label,
        forceRender: true,
        children: children(l.code, l.code === 'fa' ? 'rtl' : 'ltr'),
      }))}
    />
  );
}
