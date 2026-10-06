import { notFound } from 'next/navigation';

// Any unknown URL under a valid locale renders the locale-aware not-found page.
export default function CatchAll() {
  notFound();
}
