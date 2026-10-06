/** Local image or an inline SVG placeholder. Plain <img> is used on purpose: no remote image optimizer/CDN. */
export default function ProductImage({ src, alt, className = '' }: { src: string | null; alt: string; className?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} loading="lazy" className={`object-cover ${className}`} />;
  }
  return (
    <div className={`flex items-center justify-center bg-slate-100 text-slate-300 ${className}`} aria-label={alt}>
      <svg viewBox="0 0 24 24" className="h-1/3 w-1/3" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="10" r="1.5" />
        <path d="M21 16l-5-5-8 8" />
      </svg>
    </div>
  );
}
