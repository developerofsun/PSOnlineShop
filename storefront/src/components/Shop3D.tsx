'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import * as THREE from 'three';
import { Link } from '@/i18n/navigation';
import { useCart } from '@/lib/cart';
import { formatNumber } from '@/lib/format';
import type { ProductListItem } from '@/lib/types';
import AddToCart from './AddToCart';
import CheckoutForm from './CheckoutForm';
import { CartIcon, CloseIcon } from './icons';
import Price from './Price';
import ProductImage from './ProductImage';

export type Aisle = { id: number; name: string; products: ProductListItem[] };

// ---------------------------------------------------------------- dimensions (meters)
const SPACING = 3.6; // gondola-to-gondola distance (walkway = SPACING - GOND_D)
const GOND_D = 1.2;
const SLOT_W = 1.1;
const END = 0.3;
const PLANK_Y = [0.12, 0.74, 1.36];
const CAP_Y = 1.98;
const BOX = { w: 0.8, h: 0.56, d: 0.34 };
const WALL_H = 3.4;
const GZ = -1; // gondolas are centered on this z
const EYE = 1.6;
const RADIUS = 0.4; // trolley body
const FRONT = 0.95; // distance from the body to the front of the trolley (second collision circle)
const SPEED = 2.2;
const MAX_PER_AISLE = 18;
const TOUR_STEPS = 6;
const TOUR_KEY = 'onshop-3d-tour';
const FOV = { base: 70, min: 28, max: 85 }; // zoom = narrower field of view
const POSTER = { w: 512, h: 410, rowTop: 94, rowH: 70, rowBox: 62, plane: [2.6, 2.08] as const };

const hue = (id: number) => (id * 47) % 360;
const wrapPi = (a: number) => ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 07:05 style countdown with the page's digits. */
const minSec = (total: number, locale: string) => {
  const f = new Intl.NumberFormat(locale === 'fa' ? 'fa-IR' : 'en-US', { minimumIntegerDigits: 2, useGrouping: false });
  return `${f.format(Math.floor(total / 60))}:${f.format(total % 60)}`;
};

/** Lowercase, unify Arabic/Persian letter variants, treat the half-space (ZWNJ) as a space. */
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[‌‍]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

type Box2 = { minX: number; maxX: number; minZ: number; maxZ: number };
type Gondola = Box2 & { gx: number; L: number; slots: number };

function computeLayout(aisles: Aisle[]) {
  const n = aisles.length;
  const gondolas: Gondola[] = aisles.map((a, i) => {
    const perSide = Math.ceil(Math.min(a.products.length, MAX_PER_AISLE) / 2);
    const slots = Math.min(5, Math.max(2, Math.ceil(perSide / PLANK_Y.length)));
    const L = slots * SLOT_W + END * 2;
    const gx = (i - (n - 1) / 2) * SPACING;
    return { gx, L, slots, minX: gx - GOND_D / 2, maxX: gx + GOND_D / 2, minZ: GZ - L / 2, maxZ: GZ + L / 2 };
  });
  const Lmax = Math.max(...gondolas.map((g) => g.L));
  const W = Math.max(n * SPACING + 5, 12);
  const D = Lmax + 11;
  const spanMin = GZ - Lmax / 2 - 0.3;
  const spanMax = GZ + Lmax / 2 + 0.3;
  const counterC = { x: W / 2 - 2.4, z: D / 2 - 2.0 };
  const counter: Box2 = { minX: counterC.x - 1.3, maxX: counterC.x + 1.3, minZ: counterC.z - 0.45, maxZ: counterC.z + 0.45 };
  return {
    n, gondolas, Lmax, W, D, spanMin, spanMax,
    frontZ: GZ + Lmax / 2 + 1.4,
    start: { x: 0, z: D / 2 - 2.6 },
    counter, counterC,
    posterX: Math.max(W / 2 - 2.6, 4.2),
    obstacles: [...gondolas, counter] as Box2[],
  };
}
type Layout = ReturnType<typeof computeLayout>;

// ---------------------------------------------------------------- textures drawn with canvas (no image files)
function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, maxLines: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
}

const FONT = '"Vazirmatn Variable", Tahoma, sans-serif';

/** Front label of a product box: picture over a colored card with name, price and a red tag when discounted. */
function makeLabel(p: ProductListItem, priceText: string, rtl: boolean, badge: string | null) {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  let loaded: HTMLImageElement | undefined;

  const draw = () => {
    ctx.fillStyle = `hsl(${hue(p.id)} 45% 88%)`;
    ctx.fillRect(0, 0, 320, 256);
    if (loaded) {
      const area = { w: 320, h: 150 };
      const s = Math.max(area.w / loaded.width, area.h / loaded.height);
      const dw = loaded.width * s;
      const dh = loaded.height * s;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, area.w, area.h);
      ctx.clip();
      ctx.drawImage(loaded, (area.w - dw) / 2, (area.h - dh) / 2, dw, dh);
      ctx.restore();
    } else {
      ctx.fillStyle = `hsl(${hue(p.id)} 40% 45%)`;
      ctx.font = `bold 90px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((p.name ?? '?').trim().charAt(0), 160, 78);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 150, 320, 106);
    ctx.fillStyle = '#1e293b';
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `bold 25px ${FONT}`;
    wrap(ctx, p.name ?? p.sku, 160, 158, 300, 30, 2);
    ctx.fillStyle = '#237030';
    ctx.font = `bold 27px ${FONT}`;
    ctx.fillText(priceText, 160, 218);
    if (badge) {
      ctx.fillStyle = '#d32f2f';
      ctx.fillRect(0, 0, 92, 44);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 26px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badge, 46, 24);
    }
    texture.needsUpdate = true;
  };

  draw();
  document.fonts?.ready.then(draw); // redraw once Vazirmatn is available
  if (p.image) {
    const img = new Image();
    img.onload = () => {
      loaded = img;
      draw();
    };
    img.src = p.image; // same-origin (/uploads is proxied), so the canvas is never tainted
  }
  return texture;
}

/** Sign texture. With a logo (local /uploads image) the logo sits on a white tile at the start and the text beside it. */
function makeSign(text: string, bg: string, w = 512, h = 128, size = 54, logo: string | null = null) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  let img: HTMLImageElement | undefined;
  const draw = () => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    let cx = w / 2;
    let maxW = w - 40;
    if (img) {
      const tile = Math.min(w * 0.3, (h - 20) * (img.width / img.height) + 20);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(10, 10, tile, h - 20);
      const s = Math.min((tile - 16) / img.width, (h - 36) / img.height);
      ctx.drawImage(img, 10 + (tile - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
      cx = 10 + tile + (w - 10 - tile) / 2;
      maxW = w - 10 - tile - 30;
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, h / 2 + 4, maxW);
    tex.needsUpdate = true;
  };
  draw();
  document.fonts?.ready.then(draw);
  if (logo) {
    const i = new Image();
    i.onload = () => {
      img = i;
      draw();
    };
    i.src = logo;
  }
  return tex;
}

/** Wall poster of the best offers. Each row is clickable in the scene (see POSTER for the row geometry). */
function makeDealsPoster(title: string, hint: string, rows: { name: string; pct: string; price: string }[], rtl: boolean) {
  const canvas = document.createElement('canvas');
  canvas.width = POSTER.w;
  canvas.height = POSTER.h;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const { w, h } = POSTER;
  const draw = () => {
    ctx.fillStyle = '#fff8e6';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d32f2f';
    ctx.fillRect(0, 0, w, 78);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 46px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.fillText(title, w / 2, 42, w - 40);
    rows.forEach((r, i) => {
      const y = POSTER.rowTop + i * POSTER.rowH;
      ctx.fillStyle = i % 2 ? '#fff1cc' : '#ffffff';
      ctx.fillRect(14, y, w - 28, POSTER.rowBox);
      ctx.strokeStyle = '#f0c36a';
      ctx.strokeRect(14, y, w - 28, POSTER.rowBox);
      ctx.fillStyle = '#d32f2f';
      ctx.font = `bold 30px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(r.pct, 70, y + 32);
      ctx.fillStyle = '#1e293b';
      ctx.font = `bold 26px ${FONT}`;
      ctx.textAlign = rtl ? 'right' : 'left';
      ctx.fillText(r.name, rtl ? w - 36 : 130, y + 20, 280);
      ctx.fillStyle = '#237030';
      ctx.font = `22px ${FONT}`;
      ctx.fillText(r.price, rtl ? w - 36 : 130, y + 48, 280);
    });
    ctx.fillStyle = '#92400e';
    ctx.font = `20px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(hint, w / 2, h - 20, w - 40);
    tex.needsUpdate = true;
  };
  draw();
  document.fonts?.ready.then(draw);
  return tex;
}

function makeFloorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#e4e8e0';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#d6dbd2';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillRect(64, 64, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

type Ctrl = {
  /** Walk to a product and mark it. Returns false when the product is not on the shelves. */
  guide: (productId: number) => boolean;
  goAisle: (i: number, side?: 1 | -1) => void;
  goTo: (place: 'entrance' | 'deals' | 'counter', openCheckout?: boolean) => void;
  mapClick: (px: number, py: number) => void;
  setLow: (low: boolean) => void;
  zoomBy: (factor: number) => void;
  recenter: () => void;
};

type Sheet = 'aisles' | 'search' | 'map' | 'more' | null;

/**
 * The 3D store. On the page it is a launcher card; "Enter" opens the full view (the whole window, with the bottom menu),
 * and closing it (button, Escape or the phone's Back button) returns to the page. The 3D scene only runs inside the
 * full view.
 *
 * Inside: you push a shopping trolley.
 *  Desktop: W/S drive, A/D (or the arrows) steer, drag to look, wheel or +/- to zoom, click the floor to be driven there.
 *  Phone:   joystick to drive, drag to look, pinch to zoom, tap the floor to be driven there.
 *  Everyone: the bottom dock (Aisles / Search / Offers / Map / More) so nothing needs precise aiming at tiny 3D objects.
 * The trolley mirrors the real cart. The counter opens the checkout right inside the store.
 */
export default function Shop3D({
  aisles,
  storeName,
  findId = null,
  logoUrl = null,
  remainingSeconds = null,
  onActiveChange,
}: {
  aisles: Aisle[];
  storeName: string;
  findId?: number | null;
  /** Shop logo from the admin settings; shown on the back-wall sign. */
  logoUrl?: string | null;
  /** Time left today (null = unlimited). The countdown is owned by Shop3DGate; this only displays it. */
  remainingSeconds?: number | null;
  /** Tells the gate when the customer is inside the full view, so only that time is counted. */
  onActiveChange?: (active: boolean) => void;
}) {
  const t = useTranslations('shop3d');
  const tc = useTranslations('common');
  const locale = useLocale();

  const mountRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const joyBase = useRef<HTMLDivElement>(null);
  const joyKnob = useRef<HTMLDivElement>(null);
  const joyId = useRef<number | null>(null);
  const ctrl = useRef<Ctrl | null>(null);
  const keys = useRef(new Set<string>());
  const analog = useRef({ drive: 0, steer: 0 }); // joystick: -1..1
  const pushed = useRef(false); // we added a history entry when the full view opened (so Back closes it)

  const [entered, setEntered] = useState(false);
  const [selected, setSelected] = useState<ProductListItem | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [noWebgl, setNoWebgl] = useState(false);
  const [low, setLow] = useState(false);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState(false);
  const [sound, setSound] = useState(false);
  const [fs, setFs] = useState(false);
  const [coarse, setCoarse] = useState(false); // the main input is a finger
  const [sheet, setSheet] = useState<Sheet>(null);
  const [currentAisle, setCurrentAisle] = useState(-1);
  const [shelfAisle, setShelfAisle] = useState(0);
  const [tour, setTour] = useState<number | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const soundRef = useRef(false);
  soundRef.current = sound;
  const coarseRef = useRef(false);
  coarseRef.current = coarse;
  const blockedRef = useRef(false); // true while the checkout panel is open: the scene ignores input
  blockedRef.current = checkoutOpen;
  const openCheckoutRef = useRef<() => void>(() => {});
  openCheckoutRef.current = () => {
    if (document.fullscreenElement) void document.exitFullscreen(); // the map prompt and payment page need the normal view
    keys.current.clear();
    analog.current = { drive: 0, steer: 0 };
    setSelected(null);
    setSheet(null);
    setCheckoutOpen(true);
  };

  const counterLabel = t('counter');
  const currency = tc('currency');
  const dealsTitle = t('dealsTitle');
  const dealsHint = t('dealsHint');
  const cartItems = useCart((s) => s.items);
  const cartCount = cartItems.reduce((n, i) => n + i.qty, 0);
  const cartTotal = cartItems.reduce((n, i) => n + i.qty * i.price, 0);

  // ---------------------------------------------------------------- opening / closing the full view
  const enter = () => {
    if (entered) return;
    try {
      window.history.pushState(null, '', window.location.href); // so the phone's Back button closes the store, not the page
      pushed.current = true;
    } catch {
      pushed.current = false;
    }
    setEntered(true);
  };
  const exit = () => {
    if (pushed.current) window.history.back(); // the popstate handler below closes the view
    else setEntered(false);
  };
  useEffect(() => {
    if (!entered) return;
    const onPop = () => {
      pushed.current = false;
      setEntered(false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [entered]);

  // reset the transient UI whenever the full view closes; tell the gate whether we are inside
  useEffect(() => {
    onActiveChange?.(entered);
    if (!entered) {
      setSheet(null);
      setSelected(null);
      setCheckoutOpen(false);
      setTour(null);
      setHover(null);
      setNotice(false);
      setQuery('');
      keys.current.clear();
      analog.current = { drive: 0, steer: 0 };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entered]);

  // opened from the assistant ("/shop3d?find=ID"): go straight in
  useEffect(() => {
    if (findId != null) enter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => ctrl.current?.setLow(low), [low]);

  useEffect(() => {
    setCoarse(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  // the page behind must not scroll while the store is open
  useEffect(() => {
    if (!entered) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = old;
    };
  }, [entered]);

  useEffect(() => {
    const on = () => setFs(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen?.();
  };

  // first visit: start the guided tour once inside
  useEffect(() => {
    if (!entered) return;
    try {
      if (!localStorage.getItem(TOUR_KEY)) setTour(0);
    } catch {
      setTour(0);
    }
  }, [entered]);
  const endTour = () => {
    setTour(null);
    try {
      localStorage.setItem(TOUR_KEY, '1');
    } catch {
      /* storage blocked: the tour simply shows again next time */
    }
  };
  // some tour steps drive the trolley to the place they talk about
  useEffect(() => {
    if (tour === 3) ctrl.current?.goTo('deals');
    else if (tour === 5) ctrl.current?.goTo('counter');
  }, [tour]);

  // Escape: close the innermost thing first (checkout, a panel, the product card, the tour), then the store itself
  useEffect(() => {
    if (!entered) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (checkoutOpen) setCheckoutOpen(false);
      else if (sheet) setSheet(null);
      else if (selected) setSelected(null);
      else if (tour !== null) endTour();
      else exit();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entered, checkoutOpen, sheet, selected, tour]);

  // while the aisle panel is closed it follows the aisle the trolley is in
  useEffect(() => {
    if (sheet !== 'aisles' && currentAisle >= 0) setShelfAisle(currentAisle);
  }, [currentAisle, sheet]);

  // "Where is...?" search over the products on the shelves
  const results = useMemo(() => {
    const q = norm(query);
    if (q.length < 2) return [];
    const toks = q.split(' ');
    const out: { p: ProductListItem; aisle: string }[] = [];
    for (const a of aisles)
      for (const p of a.products.slice(0, MAX_PER_AISLE)) {
        const name = norm(p.name ?? p.sku);
        const joined = name.replace(/ /g, ''); // "تیشرت" must find "تی شرت"
        if (toks.every((tk) => name.includes(tk) || joined.includes(tk))) out.push({ p, aisle: a.name });
      }
    return out.slice(0, 6);
  }, [query, aisles]);

  const guideTo = (id: number) => {
    setNotice(false);
    setSheet(null);
    setQuery('');
    ctrl.current?.guide(id);
  };

  // ---------------------------------------------------------------- the scene (only while the full view is open)
  useEffect(() => {
    if (!entered) return;
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setNoWebgl(true);
      setEntered(false);
      return;
    }

    const rtl = locale === 'fa';
    const nf = new Intl.NumberFormat(rtl ? 'fa-IR' : 'en-US');
    const lay: Layout = computeLayout(aisles);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let lowQ = false;
    // phones have 3x screens: cap the pixel ratio, it is the biggest speed-up there
    const applyRatio = () => renderer.setPixelRatio(lowQ ? 1 : Math.min(window.devicePixelRatio, coarseRef.current ? 1.5 : 2));
    applyRatio();
    const el = renderer.domElement;
    el.style.display = 'block';
    el.style.touchAction = 'none';
    el.style.cursor = 'grab';
    mount.appendChild(el);

    // ---------------------------------------------------------------- scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeef3ee);
    scene.fog = new THREE.Fog(0xeef3ee, 16, 42);
    const camera = new THREE.PerspectiveCamera(FOV.base, 1, 0.05, 80);
    camera.rotation.order = 'YXZ';
    let fovTarget = FOV.base;
    // The "rig" is the trolley's frame of reference: it sits on the floor and turns with the trolley's heading.
    // The camera is the head on top of it (it can look around independently) and the trolley is its other child.
    const rig = new THREE.Group();
    rig.add(camera);
    scene.add(rig);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xbdcdbd, 1.25));
    const sun = new THREE.DirectionalLight(0xffffff, 0.7);
    sun.position.set(4, 9, 6);
    scene.add(sun);

    const { W, D, n } = lay;
    const mat = (color: number) => new THREE.MeshStandardMaterial({ color });

    const floorTex = makeFloorTexture();
    floorTex.repeat.set(W / 1.6, D / 1.6);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat(0xfafaf7));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = WALL_H;
    scene.add(ceiling);

    const wallMat = mat(0xf6f6f0);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, WALL_H), wallMat);
    back.position.set(0, WALL_H / 2, -D / 2);
    scene.add(back);
    const front = back.clone();
    front.rotation.y = Math.PI;
    front.position.z = D / 2;
    scene.add(front);
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(D, WALL_H), wallMat);
      w.rotation.y = (-sx * Math.PI) / 2;
      w.position.set((sx * W) / 2, WALL_H / 2, 0);
      scene.add(w);
    }
    const base = new THREE.Mesh(new THREE.BoxGeometry(W, 0.12, 0.04), mat(0x28a745)); // green skirting on the back wall
    base.position.set(0, 0.06, -D / 2 + 0.02);
    scene.add(base);

    const storeSign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.3), new THREE.MeshBasicMaterial({ map: makeSign(storeName, '#28a745', 768, 166, 78, logoUrl) }));
    storeSign.position.set(0, 2.5, -D / 2 + 0.03);
    scene.add(storeSign);

    // ceiling light panels above every walkway
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let k = 0; k <= n; k++) {
      const x = (k - n / 2) * SPACING;
      for (let z = -D / 2 + 3; z < D / 2 - 1; z += 3.2) {
        const lp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 1.6), lightMat);
        lp.position.set(x, WALL_H - 0.03, z);
        scene.add(lp);
      }
    }

    // ---------------------------------------------------------------- gondolas + products
    const woodDark = mat(0x5f6b60);
    const panel = mat(0xf1efe7);
    const plank = mat(0xc9ccc2);
    const accent = mat(0xe08600);
    const pickables: THREE.Mesh[] = [];
    // soft dark patches on the floor under furniture (cheap fake contact shadows)
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false });
    const addShadow = (x: number, z: number, w: number, d: number) => {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d), shadowMat);
      s.rotation.x = -Math.PI / 2;
      s.position.set(x, 0.012, z);
      scene.add(s);
    };

    aisles.forEach((aisle, ai) => {
      const g = lay.gondolas[ai];
      const grp = new THREE.Group();
      grp.position.set(g.gx, 0, GZ);

      const plinth = new THREE.Mesh(new THREE.BoxGeometry(GOND_D, 0.1, g.L), woodDark);
      plinth.position.y = 0.05;
      grp.add(plinth);
      const center = new THREE.Mesh(new THREE.BoxGeometry(0.06, CAP_Y, g.L), panel);
      center.position.y = CAP_Y / 2;
      grp.add(center);
      for (const sz of [-1, 1]) {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(GOND_D, CAP_Y, 0.05), accent);
        cap.position.set(0, CAP_Y / 2, (sz * g.L) / 2);
        grp.add(cap);
      }
      const top = new THREE.Mesh(new THREE.BoxGeometry(GOND_D, 0.06, g.L), woodDark);
      top.position.y = CAP_Y;
      grp.add(top);
      for (const side of [-1, 1]) {
        for (const y of PLANK_Y) {
          const pl = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, g.L - 0.1), plank);
          pl.position.set(side * 0.305, y, 0);
          grp.add(pl);
        }
      }

      // hanging aisle sign, readable from the entrance and from the back corridor
      const signTex = makeSign(aisle.name, '#28a745');
      for (const dir of [1, -1]) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.52), new THREE.MeshBasicMaterial({ map: signTex }));
        s.position.set(0, WALL_H - 0.75, dir * 0.04);
        s.rotation.y = dir === 1 ? 0 : Math.PI;
        grp.add(s);
      }
      for (const rx of [-0.8, 0.8]) {
        const rod = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5, 0.02), woodDark);
        rod.position.set(rx, WALL_H - 0.25, 0);
        grp.add(rod);
      }

      aisle.products.slice(0, MAX_PER_AISLE).forEach((p, k) => {
        const side: 1 | -1 = k % 2 === 0 ? 1 : -1;
        const idx = Math.floor(k / 2);
        const level = Math.floor(idx / g.slots);
        const slot = idx % g.slots;
        const onSale = p.salePrice != null && p.salePrice < p.price;
        const badge = onSale ? `${nf.format(Math.round(((p.price - p.salePrice!) / p.price) * 100))}${rtl ? '٪' : '%'}` : null;

        const plain = new THREE.MeshStandardMaterial({ color: new THREE.Color(`hsl(${hue(p.id)}, 40%, 80%)`) });
        const label = new THREE.MeshStandardMaterial({ map: makeLabel(p, `${nf.format(p.salePrice ?? p.price)} ${currency}`, rtl, badge) });
        // BoxGeometry face order: +x, -x, +y, -y, +z, -z. The label faces the walkway on this side.
        const mats = [plain, plain, plain, plain, plain, plain];
        mats[side === 1 ? 0 : 1] = label;
        const box = new THREE.Mesh(new THREE.BoxGeometry(BOX.d, BOX.h, BOX.w), mats);
        box.position.set(side * (0.58 - BOX.d / 2), PLANK_Y[level] + 0.025 + BOX.h / 2, -g.L / 2 + END + SLOT_W * (slot + 0.5));
        box.userData = { product: p, aisle: ai, side };
        pickables.push(box);
        grp.add(box);
      });
      addShadow(g.gx, GZ, GOND_D + 0.6, g.L + 0.6);
      scene.add(grp);
    });

    // checkout counter near the entrance (click it: the trolley drives there and the checkout opens)
    const counter = new THREE.Group();
    counter.position.set(lay.counterC.x, 0, lay.counterC.z);
    const desk = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.95, 0.9), mat(0x28a745));
    desk.position.y = 0.475;
    counter.add(desk);
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.06, 1.0), mat(0xf1efe7));
    deskTop.position.y = 0.97;
    counter.add(deskTop);
    const register = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.4), mat(0x33413a));
    register.position.set(-0.7, 1.18, 0);
    counter.add(register);
    desk.userData = { checkout: true };
    deskTop.userData = { checkout: true };
    register.userData = { checkout: true };
    pickables.push(desk, deskTop, register);
    const counterSign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshBasicMaterial({ map: makeSign(counterLabel, '#e08600', 512, 128, 60) }));
    counterSign.position.set(0, 2.2, 0);
    counter.add(counterSign);
    addShadow(lay.counterC.x, lay.counterC.z, 3.1, 1.5);
    scene.add(counter);

    // wall of offers: rows are clickable
    const deals = aisles
      .flatMap((a) => a.products)
      .filter((p) => p.salePrice != null && p.salePrice < p.price)
      .sort((a, b) => (b.price - b.salePrice!) / b.price - (a.price - a.salePrice!) / a.price)
      .slice(0, 4);
    if (deals.length > 0) {
      const rows = deals.map((p) => ({
        name: p.name ?? p.sku,
        pct: `${nf.format(Math.round(((p.price - p.salePrice!) / p.price) * 100))}${rtl ? '٪' : '%'}`,
        price: `${nf.format(p.salePrice!)} ${currency}`,
      }));
      const poster = new THREE.Mesh(
        new THREE.PlaneGeometry(POSTER.plane[0], POSTER.plane[1]),
        new THREE.MeshBasicMaterial({ map: makeDealsPoster(dealsTitle, dealsHint, rows, rtl) }),
      );
      poster.position.set(lay.posterX, 1.9, -D / 2 + 0.03);
      poster.userData = { poster: true };
      pickables.push(poster);
      scene.add(poster);
    }
    /** The deal under a poster hit (uv: 0..1, v up), or null for the title / gaps. */
    const dealAt = (uv: THREE.Vector2 | undefined) => {
      if (!uv) return null;
      const cy = (1 - uv.y) * POSTER.h - POSTER.rowTop;
      if (cy < 0) return null;
      const row = Math.floor(cy / POSTER.rowH);
      return cy - row * POSTER.rowH <= POSTER.rowBox ? (deals[row] ?? null) : null;
    };

    // ---------------------------------------------------------------- the trolley (child of the rig, so you can look into it)
    const trolley = new THREE.Group();
    rig.add(trolley);
    const chrome = new THREE.MeshStandardMaterial({ color: 0xb8c0c8, metalness: 0.6, roughness: 0.35 });
    const plastic = new THREE.MeshStandardMaterial({ color: 0xd9482b });
    const grid = new THREE.MeshStandardMaterial({ color: 0xdfe5ea, transparent: true, opacity: 0.28, depthWrite: false });
    const BW = 0.56;
    const BCZ = -0.92; // basket center (forward = -z)
    const BL = 0.8;
    const Y0 = 0.56; // basket floor
    const Y1 = 0.92; // basket rim
    const part = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      trolley.add(mesh);
      return mesh;
    };
    part(grid, BW, 0.01, BL, 0, Y0, BCZ); // floor
    part(grid, BW, Y1 - Y0, 0.01, 0, (Y0 + Y1) / 2, BCZ - BL / 2); // front
    part(grid, BW, Y1 - Y0, 0.01, 0, (Y0 + Y1) / 2, BCZ + BL / 2); // back
    part(grid, 0.01, Y1 - Y0, BL, BW / 2, (Y0 + Y1) / 2, BCZ); // sides
    part(grid, 0.01, Y1 - Y0, BL, -BW / 2, (Y0 + Y1) / 2, BCZ);
    for (const sx of [-1, 1]) {
      part(chrome, 0.022, 0.022, BL, (sx * BW) / 2, Y1, BCZ); // rim rails
      for (const sz of [-1, 1]) part(chrome, 0.022, Y1 - Y0, 0.022, (sx * BW) / 2, (Y0 + Y1) / 2, BCZ + (sz * BL) / 2); // corner posts
    }
    part(chrome, BW, 0.022, 0.022, 0, Y1, BCZ - BL / 2);
    part(chrome, BW, 0.022, 0.022, 0, Y1, BCZ + BL / 2);
    part(plastic, BW + 0.08, 0.04, 0.04, 0, 0.99, BCZ + BL / 2 - 0.1); // push handle
    for (const sx of [-1, 1]) part(chrome, 0.022, 0.1, 0.022, (sx * BW) / 2, 0.94, BCZ + BL / 2 - 0.1); // handle posts
    const wheels: THREE.Group[] = [];
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const wz = BCZ + (sz * (BL - 0.18)) / 2;
        part(chrome, 0.022, Y0 - 0.1, 0.022, (sx * (BW - 0.1)) / 2, (Y0 + 0.1) / 2, wz); // legs
        const wg = new THREE.Group();
        wg.position.set((sx * (BW - 0.1)) / 2, 0.06, wz);
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.035, 14), mat(0x2b2f33));
        wheel.rotation.z = Math.PI / 2;
        wg.add(wheel);
        trolley.add(wg);
        wheels.push(wg);
      }

    const trolleyItems = new THREE.Group();
    trolleyItems.position.set(0, Y0 + 0.005, BCZ);
    trolley.add(trolleyItems);

    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const renderTrolley = () => {
      for (const c of [...trolleyItems.children]) {
        ((c as THREE.Mesh).material as THREE.Material).dispose();
        trolleyItems.remove(c);
      }
      const ids: number[] = [];
      for (const i of useCart.getState().items) for (let q = 0; q < Math.min(i.qty, 3); q++) ids.push(i.productId);
      ids.slice(0, 30).forEach((id, k) => {
        const m = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: new THREE.Color(`hsl(${hue(id)}, 55%, 62%)`) }));
        const col = k % 3;
        const row = Math.floor(k / 3) % 5;
        const layer = Math.floor(k / 15);
        const h = 0.16 + (id % 3) * 0.03;
        m.scale.set(0.14, h, 0.11);
        m.position.set(-0.17 + col * 0.17, h / 2 + layer * 0.19, -BL / 2 + 0.1 + row * 0.15);
        m.rotation.y = ((id * 37 + k * 11) % 40) / 100 - 0.2;
        trolleyItems.add(m);
      });
    };

    type Flyer = { mesh: THREE.Mesh; t0: number };
    const flyers: Flyer[] = [];
    const FLY_MS = 380;
    const FROM = new THREE.Vector3(0.1, 1.25, -0.45);
    const TO = new THREE.Vector3(0, Y0 + 0.2, BCZ);
    const spawnFlyer = (productId: number) => {
      const mesh = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: new THREE.Color(`hsl(${hue(productId)}, 55%, 62%)`) }));
      mesh.scale.set(0.14, 0.18, 0.11);
      mesh.position.copy(FROM);
      rig.add(mesh);
      flyers.push({ mesh, t0: performance.now() });
    };

    // short synthesized "added" chime (no audio files); off until the customer turns the sound on
    let audio: AudioContext | null = null;
    const beep = () => {
      if (!soundRef.current) return;
      try {
        audio ??= new AudioContext();
        const t0 = audio.currentTime;
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(880, t0);
        o.frequency.exponentialRampToValueAtTime(1320, t0 + 0.12);
        g.gain.setValueAtTime(0.08, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
        o.connect(g).connect(audio.destination);
        o.start(t0);
        o.stop(t0 + 0.18);
      } catch {
        /* audio not available: stay silent */
      }
    };

    let ready = false; // ignore the cart being restored from storage at load
    const readyTimer = setTimeout(() => (ready = true), 900);
    let prevCart = new Map(useCart.getState().items.map((i) => [i.productId, i.qty]));
    renderTrolley();
    const unsub = useCart.subscribe((s) => {
      const cur = new Map(s.items.map((i) => [i.productId, i.qty]));
      let added: number | null = null;
      for (const [id, q] of cur) if (q > (prevCart.get(id) ?? 0)) added = id;
      prevCart = cur;
      if (added != null && ready) beep();
      if (added != null && ready && !reduce) spawnFlyer(added);
      else renderTrolley();
    });

    // ---------------------------------------------------------------- the trolley's motion
    const pos = { x: lay.start.x, z: lay.start.z };
    let heading = 0; // where the trolley points (0 = toward the back wall)
    let look = 0; // where the head looks, relative to the heading
    let pitch = -0.35; // slightly down, so the trolley is in view
    let v = 0; // forward speed, m/s (negative = reversing)
    let headGoal: number | null = null;
    let lookGoal: number | null = null;
    let path: { x: number; z: number }[] = [];
    let endHeading: number | null = null;
    let endLook: number | null = null;
    let pendingCheckout = false;
    let lastLookInput = 0;

    // orange dots on the floor showing the way while the assistant guides you
    const trail = new THREE.Group();
    scene.add(trail);
    const trailMat = new THREE.MeshBasicMaterial({ color: 0xe08600 });
    const trailGeo = new THREE.CircleGeometry(0.11, 14);
    const clearTrail = () => {
      for (const c of [...trail.children]) trail.remove(c);
    };
    const buildTrail = (pts: { x: number; z: number }[]) => {
      clearTrail();
      let prev = { x: pos.x, z: pos.z };
      for (const p of pts) {
        const steps = Math.floor(Math.hypot(p.x - prev.x, p.z - prev.z) / 0.8);
        for (let i = 1; i <= steps; i++) {
          const m = new THREE.Mesh(trailGeo, trailMat);
          m.rotation.x = -Math.PI / 2;
          m.position.set(prev.x + ((p.x - prev.x) * i) / steps, 0.03, prev.z + ((p.z - prev.z) * i) / steps);
          trail.add(m);
        }
        prev = p;
      }
    };

    const blocked = (x: number, z: number) => {
      if (x < -W / 2 + 0.5 || x > W / 2 - 0.5 || z < -D / 2 + 0.5 || z > D / 2 - 0.5) return true;
      return lay.obstacles.some((b) => x > b.minX - RADIUS && x < b.maxX + RADIUS && z > b.minZ - RADIUS && z < b.maxZ + RADIUS);
    };
    /** The trolley is long: check the body and its front end, so the basket never goes through a shelf. */
    const blockedAt = (x: number, z: number, h: number) => blocked(x, z) || blocked(x - Math.sin(h) * FRONT, z - Math.cos(h) * FRONT);
    const turnTo = (h: number) => {
      if (blockedAt(pos.x, pos.z, h)) return false;
      heading = h;
      return true;
    };

    const walkCenters = Array.from({ length: n + 1 }, (_, k) => (k - n / 2) * SPACING);
    const nearestWalk = (x: number) => walkCenters.reduce((b, c) => (Math.abs(c - x) < Math.abs(b - x) ? c : b), walkCenters[0]);
    const inSpan = (z: number) => z >= lay.spanMin && z <= lay.spanMax;
    const lane = (x: number) => {
      const c = nearestWalk(x);
      return Math.abs(x - c) <= (SPACING - GOND_D) / 2 ? c : null;
    };

    /** Drive to (tx,tz) using the corridors, so the route never cuts through a shelf. Optionally park facing a heading/look. */
    const routeTo = (tx: number, tz: number, eh: number | null = null, el2: number | null = null, guided = false) => {
      if (blocked(tx, tz)) return;
      if (reduce) {
        pos.x = tx;
        pos.z = tz;
        if (eh != null) heading = eh;
        if (el2 != null) look = el2;
        path = [];
        return;
      }
      const pts: { x: number; z: number }[] = [];
      let cx = pos.x;
      let cz = pos.z;
      const push = (x: number, z: number) => {
        pts.push({ x, z });
        cx = x;
        cz = z;
      };
      const la = lane(cx);
      const lb = lane(tx);
      const sameLane = inSpan(cz) && inSpan(tz) && la != null && la === lb;
      const bothFront = cz > lay.spanMax && tz > lay.spanMax;
      const bothBack = cz < lay.spanMin && tz < lay.spanMin;

      if (sameLane || bothFront || bothBack) push(tx, tz);
      else {
        if (inSpan(cz)) push(cx, lay.frontZ); // leave the aisle to the front corridor
        else if (cz < lay.spanMin) {
          const wx = nearestWalk(cx); // from the back corridor, come forward through a walkway
          push(wx, cz);
          push(wx, lay.frontZ);
        } else if (cz > lay.frontZ) push(cx, lay.frontZ);

        if (inSpan(tz)) {
          push(tx, cz);
          push(tx, tz);
        } else if (tz < lay.spanMin) {
          const wx = nearestWalk(tx);
          push(wx, cz);
          push(wx, tz);
          push(tx, tz);
        } else push(tx, tz);
      }
      path = pts;
      endHeading = eh;
      endLook = el2;
      headGoal = null;
      lookGoal = null;
      if (guided) buildTrail(pts);
      else clearTrail();
    };

    /** Park in the walkway beside a shelf: trolley along the aisle, head turned toward the shelf. */
    const goAisle = (i: number, side: 1 | -1 = 1, z = GZ, guided = false) => {
      const g = lay.gondolas[i];
      if (!g) return;
      routeTo(g.gx + side * (SPACING / 2), z, 0, side === 1 ? Math.PI / 2 : -Math.PI / 2, guided);
    };
    const goTo = (place: 'entrance' | 'deals' | 'counter', openCheckout = false) => {
      pendingCheckout = false;
      if (place === 'entrance') routeTo(lay.start.x, lay.start.z, 0, 0);
      else if (place === 'deals') routeTo(lay.posterX, -D / 2 + 2.4, 0, 0);
      else {
        routeTo(lay.counterC.x, lay.counterC.z - 2.0, Math.PI, 0); // facing the counter
        if (openCheckout) {
          if (reduce || !path.length) openCheckoutRef.current();
          else pendingCheckout = true;
        }
      }
    };

    // arrow above the product the assistant is guiding you to
    let beacon: THREE.Mesh | null = null;
    let beaconBase = 0;
    let beaconUntil = 0;
    const guide = (productId: number) => {
      const box = pickables.find((m) => m.userData.product?.id === productId);
      if (!box) return false;
      const wp = new THREE.Vector3();
      box.getWorldPosition(wp);
      goAisle(box.userData.aisle as number, box.userData.side as 1 | -1, wp.z, true); // stop right in front of it
      if (!beacon) {
        beacon = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.24, 14), new THREE.MeshBasicMaterial({ color: 0xe08600 }));
        beacon.rotation.x = Math.PI; // tip pointing down
        scene.add(beacon);
      }
      beaconBase = wp.y + BOX.h / 2 + 0.32;
      beacon.position.set(wp.x, beaconBase, wp.z);
      beacon.visible = true;
      beaconUntil = performance.now() + 25000;
      setSelected(box.userData.product as ProductListItem);
      return true;
    };

    // ---------------------------------------------------------------- minimap
    const mm = { s: 1, ox: 4, oy: 4 };
    const drawMap = () => {
      const c = mapRef.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const s = Math.min((c.width - 8) / W, (c.height - 8) / D);
      mm.s = s;
      mm.ox = (c.width - W * s) / 2;
      mm.oy = (c.height - D * s) / 2;
      const X = (x: number) => mm.ox + (x + W / 2) * s;
      const Z = (z: number) => mm.oy + (z + D / 2) * s;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.fillStyle = '#f6f6f0';
      ctx.fillRect(X(-W / 2), Z(-D / 2), W * s, D * s);
      ctx.strokeStyle = '#94a3b8';
      ctx.strokeRect(X(-W / 2), Z(-D / 2), W * s, D * s);
      ctx.fillStyle = '#28a745';
      for (const g of lay.gondolas) ctx.fillRect(X(g.minX), Z(g.minZ), (g.maxX - g.minX) * s, (g.maxZ - g.minZ) * s);
      ctx.fillStyle = '#e08600';
      ctx.fillRect(X(lay.counter.minX), Z(lay.counter.minZ), (lay.counter.maxX - lay.counter.minX) * s, (lay.counter.maxZ - lay.counter.minZ) * s);
      if (deals.length) {
        ctx.fillStyle = '#d32f2f';
        ctx.fillRect(X(lay.posterX) - 14, Z(-D / 2), 28, 6);
      }
      const px = X(pos.x);
      const pz = Z(pos.z);
      // trolley (gray) and view direction (red)
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(px, pz);
      ctx.lineTo(px - Math.sin(heading) * 18, pz - Math.cos(heading) * 18);
      ctx.stroke();
      const view = heading + look;
      ctx.strokeStyle = '#d32f2f';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(px, pz);
      ctx.lineTo(px - Math.sin(view) * 26, pz - Math.cos(view) * 26);
      ctx.stroke();
      ctx.fillStyle = '#d32f2f';
      ctx.beginPath();
      ctx.arc(px, pz, 7, 0, Math.PI * 2);
      ctx.fill();
    };
    const mapClick = (px: number, py: number) => {
      const x = (px - mm.ox) / mm.s - W / 2;
      const z = (py - mm.oy) / mm.s - D / 2;
      const gi = lay.gondolas.findIndex((g) => x > g.minX - 1 && x < g.maxX + 1 && z > g.minZ - 0.5 && z < g.maxZ + 0.5);
      if (gi >= 0) goAisle(gi, x >= lay.gondolas[gi].gx ? 1 : -1);
      else routeTo(x, z);
    };

    const zoomBy = (f: number) => {
      fovTarget = clamp(fovTarget / f, FOV.min, FOV.max);
    };

    ctrl.current = {
      guide,
      goAisle,
      goTo,
      mapClick,
      zoomBy,
      recenter: () => {
        lookGoal = 0;
      },
      setLow: (val) => {
        lowQ = val;
        applyRatio();
        resize();
      },
    };

    // ---------------------------------------------------------------- sizing
    function resize() {
      const w = mount!.clientWidth;
      const h = mount!.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // ---------------------------------------------------------------- input: look (drag), zoom (pinch/wheel), tap (pick / drive), hover
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const cast = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
    };
    /**
     * Fingers are fat and shelf products are small: when a tap misses every product, pick the nearest product that faces
     * the camera and is within ~36 px of the tap on screen.
     */
    const pickNear = (e: PointerEvent): THREE.Mesh | null => {
      const r = el.getBoundingClientRect();
      const tx = e.clientX - r.left;
      const ty = e.clientY - r.top;
      const cam = new THREE.Vector3();
      camera.getWorldPosition(cam);
      const p = new THREE.Vector3();
      let best: THREE.Mesh | null = null;
      let bestD = e.pointerType === 'mouse' ? 0 : 36;
      for (const m of pickables) {
        const u = m.userData;
        if (!u.product) continue;
        m.getWorldPosition(p);
        if ((cam.x - p.x) * (u.side as number) <= 0) continue; // its label faces away from us
        if (cam.distanceTo(p) > 9) continue;
        p.project(camera);
        if (p.z > 1 || p.z < -1) continue;
        const sx = ((p.x + 1) / 2) * r.width;
        const sy = ((1 - p.y) / 2) * r.height;
        const d = Math.hypot(sx - tx, sy - ty);
        if (d < bestD) {
          bestD = d;
          best = m;
        }
      }
      return best;
    };

    let hovered: THREE.Mesh | null = null;
    let hoverKey = '';
    const onHover = (e: PointerEvent) => {
      cast(e);
      const hit = ray.intersectObjects(pickables, false)[0];
      const obj = (hit?.object as THREE.Mesh | undefined) ?? null;
      const deal = obj?.userData.poster ? dealAt(hit?.uv) : null;
      if (obj !== hovered) {
        hovered?.scale.setScalar(1);
        hovered = obj;
        if (obj?.userData.product) obj.scale.setScalar(1.05);
      }
      el.style.cursor = obj && (!obj.userData.poster || deal) ? 'pointer' : 'grab';
      const key = !obj ? '' : obj.userData.checkout ? 'checkout' : obj.userData.poster ? `deal-${deal?.id ?? 0}` : String(obj.userData.product.id);
      if (key !== hoverKey) {
        hoverKey = key;
        setHover(!obj ? null : obj.userData.checkout ? counterLabel : obj.userData.poster ? (deal?.name ?? null) : (obj.userData.product as ProductListItem).name);
      }
    };
    const selectProduct = (m: THREE.Mesh, far: boolean) => {
      const u = m.userData;
      setSelected(u.product as ProductListItem);
      if (far) goAisle(u.aisle as number, u.side as 1 | -1); // too far to reach: drive over
    };
    const onTap = (e: PointerEvent) => {
      cast(e);
      const hit = ray.intersectObjects(pickables, false)[0];
      if (hit) {
        const u = hit.object.userData;
        if (u.checkout) {
          goTo('counter', true); // drive to the counter and open the checkout there
          return;
        }
        if (u.poster) {
          const deal = dealAt(hit.uv);
          if (deal) {
            setSelected(deal);
            if (hit.distance > 6) goTo('deals');
          }
          return;
        }
        selectProduct(hit.object as THREE.Mesh, hit.distance > 5);
        return;
      }
      const near = pickNear(e);
      if (near) return selectProduct(near, false);
      setSelected(null);
      const f = ray.intersectObject(floor)[0];
      if (f) routeTo(f.point.x, f.point.z);
    };

    // pointer bookkeeping: one finger = look / tap, two fingers = pinch zoom
    const pts = new Map<number, { x: number; y: number }>();
    let drag: { id: number; x: number; y: number; sx: number; sy: number; moved: boolean } | null = null;
    let pinchDist = 0;
    const pinchSpan = () => {
      const [a, b] = [...pts.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const onDown = (e: PointerEvent) => {
      if (blockedRef.current) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture(e.pointerId);
      if (pts.size === 1) drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
      else if (pts.size === 2) {
        if (drag) drag.moved = true; // a second finger turns the gesture into a pinch: never a tap
        pinchDist = pinchSpan();
      }
    };
    const onMove = (e: PointerEvent) => {
      if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const d = pinchSpan();
        if (pinchDist > 0 && d > 0) {
          fovTarget = clamp(camera.fov / (d / pinchDist), FOV.min, FOV.max);
          camera.fov = fovTarget; // follow the fingers immediately
          camera.updateProjectionMatrix();
        }
        pinchDist = d;
        return;
      }
      if (drag && drag.id === e.pointerId) {
        if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true;
        if (drag.moved) {
          // the world follows the finger: dragging right turns the head left. Zoomed in = finer movement.
          const k = 0.0045 * (camera.fov / FOV.base);
          look = wrapPi(look + (e.clientX - drag.x) * k);
          pitch = clamp(pitch + (e.clientY - drag.y) * k, -1.1, 0.8);
          lookGoal = null;
          lastLookInput = performance.now();
          el.style.cursor = 'grabbing';
        }
        drag.x = e.clientX;
        drag.y = e.clientY;
      } else if (e.pointerType === 'mouse' && !blockedRef.current) onHover(e);
    };
    const onUp = (e: PointerEvent) => {
      if (drag && drag.id === e.pointerId && !drag.moved && pts.size === 1 && e.type === 'pointerup') onTap(e);
      pts.delete(e.pointerId);
      pinchDist = 0;
      if (pts.size === 0) drag = null;
      else if (pts.size === 1) {
        // one finger stays after a pinch: keep looking with it, but it can never become a tap
        const [[id, p]] = [...pts.entries()];
        drag = { id, x: p.x, y: p.y, sx: p.x, sy: p.y, moved: true };
      }
      el.style.cursor = hovered ? 'pointer' : 'grab';
    };
    const onWheel = (e: WheelEvent) => {
      if (blockedRef.current) return;
      e.preventDefault();
      zoomBy(Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });

    // ---------------------------------------------------------------- input: keyboard
    // W/S drive, A/D and the left/right arrows steer, C re-centers the view, +/- zoom
    const MAP: Record<string, string> = {
      w: 'f', W: 'f', ArrowUp: 'f', s: 'b', S: 'b', ArrowDown: 'b',
      a: 'tl', A: 'tl', ArrowLeft: 'tl', d: 'tr', D: 'tr', ArrowRight: 'tr', c: 'c', C: 'c',
    };
    const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]');
    const onKeyDown = (e: KeyboardEvent) => {
      if (typing(e) || blockedRef.current || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '+' || e.key === '=') return zoomBy(1.2);
      if (e.key === '-' || e.key === '_') return zoomBy(1 / 1.2);
      const k = MAP[e.key];
      if (!k) return;
      e.preventDefault();
      keys.current.add(k);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = MAP[e.key];
      if (k) keys.current.delete(k);
    };
    const onBlur = () => keys.current.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    // ---------------------------------------------------------------- loop
    let raf = 0;
    let last = performance.now();
    let mapTick = 0;
    let stuck = 0;
    let shownAisle = -2;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const k = keys.current;
      const live = !blockedRef.current;

      // keys give -1/0/1, the touch joystick gives a smooth -1..1; whichever is active wins
      const keyDrive = live ? (k.has('f') ? 1 : 0) - (k.has('b') ? 1 : 0) : 0;
      const keySteer = live ? (k.has('tl') ? 1 : 0) - (k.has('tr') ? 1 : 0) : 0;
      const drive = keyDrive || (live ? analog.current.drive : 0);
      const steer = keySteer || (live ? analog.current.steer : 0);
      if (live && k.has('c')) {
        lookGoal = 0;
        k.delete('c');
      }

      let target = 0; // the speed we want
      if (drive) {
        path = [];
        clearTrail();
        pendingCheckout = false;
        headGoal = null;
        target = drive > 0 ? SPEED * drive : SPEED * 0.55 * drive;
        // while driving forward the head slowly returns to the front, unless the customer is looking around
        if (drive > 0 && now - lastLookInput > 1500 && lookGoal == null) look -= look * Math.min(1, dt * 1.6);
      } else if (path.length) {
        const head = path[0];
        const dx = head.x - pos.x;
        const dz = head.z - pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.25) {
          path.shift();
          if (!path.length) {
            clearTrail();
            headGoal = endHeading;
            lookGoal = endLook ?? 0;
            if (pendingCheckout) {
              pendingCheckout = false;
              openCheckoutRef.current();
            }
          }
        } else {
          // steer toward the waypoint like a real trolley: turn first when the angle is large, then drive
          const diff = wrapPi(Math.atan2(-dx, -dz) - heading);
          turnTo(heading + diff * Math.min(1, dt * 5));
          target = Math.abs(diff) > 1.1 ? 0 : SPEED * Math.max(0.25, Math.cos(diff));
          look -= look * Math.min(1, dt * 2.5); // look where we go
        }
      }

      // steering: faster while rolling, slow in place
      if (steer) {
        headGoal = null;
        const rate = 1.7 * (0.45 + 0.55 * Math.min(1, Math.abs(v) / SPEED));
        turnTo(heading + steer * rate * dt);
      }

      // parking: ease into the final heading and look
      if (headGoal != null) {
        const diff = wrapPi(headGoal - heading);
        if (!turnTo(heading + diff * Math.min(1, dt * 4)) || Math.abs(diff) < 0.01) headGoal = null;
      }
      if (lookGoal != null) {
        const diff = wrapPi(lookGoal - look);
        look = wrapPi(look + diff * Math.min(1, dt * 4));
        if (Math.abs(diff) < 0.01) lookGoal = null;
      }
      if (headGoal != null || lookGoal != null) pitch += (-0.3 - pitch) * Math.min(1, dt * 2.5);

      // inertia: the trolley speeds up and rolls on a little when you let go
      v += (target - v) * Math.min(1, dt * (target === 0 ? 4 : 3));
      if (Math.abs(v) < 0.01) v = 0;
      if (v !== 0) {
        const bx = pos.x;
        const bz = pos.z;
        const nx = pos.x - Math.sin(heading) * v * dt;
        const nz = pos.z - Math.cos(heading) * v * dt;
        if (!blockedAt(nx, pos.z, heading)) pos.x = nx;
        if (!blockedAt(pos.x, nz, heading)) pos.z = nz;
        const moved = Math.hypot(pos.x - bx, pos.z - bz);
        if (moved < Math.abs(v) * dt * 0.2) {
          v *= 0.5; // pressing against something: lose speed
          if (path.length && target > 0 && ++stuck > 20) {
            path = []; // wedged: give up this drive
            clearTrail();
            pendingCheckout = false;
            stuck = 0;
          }
        } else stuck = 0;
      }
      for (const w of wheels) w.rotation.x -= (v * dt) / 0.06;

      rig.position.set(pos.x, 0, pos.z);
      rig.rotation.y = heading;
      camera.position.set(0, EYE + (Math.abs(v) > 0.3 && !reduce ? Math.sin(now / 110) * 0.015 : 0), 0);
      camera.rotation.set(pitch, look, 0);

      // smooth zoom
      if (Math.abs(camera.fov - fovTarget) > 0.05) {
        camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 10);
        camera.updateProjectionMatrix();
      }

      // items dropping into the trolley
      for (let i = flyers.length - 1; i >= 0; i--) {
        const fl = flyers[i];
        const kk = Math.min((now - fl.t0) / FLY_MS, 1);
        fl.mesh.position.lerpVectors(FROM, TO, kk);
        fl.mesh.position.y += Math.sin(kk * Math.PI) * 0.18;
        if (kk >= 1) {
          rig.remove(fl.mesh);
          (fl.mesh.material as THREE.Material).dispose();
          flyers.splice(i, 1);
          renderTrolley();
        }
      }

      if (beacon?.visible) {
        if (now > beaconUntil) beacon.visible = false;
        else beacon.position.y = beaconBase + (reduce ? 0 : Math.sin(now / 220) * 0.06);
      }

      // which aisle are we in? (drives the "this aisle" panel)
      if (mapTick % 10 === 0) {
        let near = -1;
        let nd = 2.4;
        lay.gondolas.forEach((g, i) => {
          if (pos.z < g.minZ - 1.5 || pos.z > g.maxZ + 1.5) return;
          const d = Math.abs(pos.x - g.gx);
          if (d < nd) {
            nd = d;
            near = i;
          }
        });
        if (near !== shownAisle) {
          shownAisle = near;
          setCurrentAisle(near);
        }
      }

      if (++mapTick % 4 === 0) drawMap();
      renderer.render(scene, camera);
    };
    loop();

    // opened from the assistant ("/shop3d?find=ID"): start guiding once the scene is up
    const findTimer =
      findId != null
        ? setTimeout(() => {
            if (!guide(findId)) setNotice(true);
          }, 700)
        : null;

    return () => {
      if (findTimer) clearTimeout(findTimer);
      cancelAnimationFrame(raf);
      clearTimeout(readyTimer);
      unsub();
      ro.disconnect();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      keys.current.clear();
      analog.current = { drive: 0, steer: 0 };
      ctrl.current = null;
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mt of mats) {
          (mt as THREE.MeshStandardMaterial).map?.dispose();
          mt.dispose();
        }
      });
      unitBox.dispose();
      void audio?.close();
      renderer.dispose();
      el.remove();
    };
  }, [entered, aisles, locale, counterLabel, currency, dealsTitle, dealsHint, storeName, logoUrl, findId]);

  // ---------------------------------------------------------------- the launcher card (on the page)
  if (!entered)
    return (
      <div className="card overflow-hidden">
        {noWebgl && <p className="bg-amber-50 p-3 text-center text-sm text-amber-900">{t('noWebgl')}</p>}
        <div className="grid gap-6 p-5 sm:p-8 md:grid-cols-[1fr_auto] md:items-center">
          <div className="space-y-4">
            <h2 className="text-xl font-extrabold">{t('launcherTitle')}</h2>
            <p className="text-sm leading-7 text-slate-600">{t('launcherText')}</p>
            <ul className="space-y-1 text-sm text-slate-700">
              <li>🛒 {t('launcherF1')}</li>
              <li>🏷️ {t('launcherF2')}</li>
              <li>🧾 {t('launcherF3')}</li>
            </ul>
            <div className="flex flex-wrap gap-2">
              {aisles.map((a) => (
                <span key={a.id} className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
                  {a.name}
                </span>
              ))}
            </div>
            {remainingSeconds != null && (
              <p className="text-sm text-slate-500">
                ⏱ {t('timeToday')}: <b>{minSec(remainingSeconds, locale)}</b>
              </p>
            )}
          </div>
          <div className="flex flex-col items-stretch gap-2 md:w-64">
            <button type="button" onClick={enter} disabled={noWebgl} className="btn h-14 text-base">
              🚪 {t('enter')}
            </button>
            <Link href="/products" className="btn-outline">
              {t('listView')}
            </Link>
          </div>
        </div>
      </div>
    );

  // ---------------------------------------------------------------- joystick (touch)
  const joyMove = (e: React.PointerEvent) => {
    const base = joyBase.current;
    const knob = joyKnob.current;
    if (!base || !knob) return;
    const b = base.getBoundingClientRect();
    const R = b.width / 2 - 24;
    let dx = e.clientX - (b.left + b.width / 2);
    let dy = e.clientY - (b.top + b.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx *= R / len;
      dy *= R / len;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const dead = 0.18;
    const nx = dx / R;
    const ny = dy / R;
    analog.current.steer = Math.abs(nx) < dead ? 0 : -nx; // left = steer left
    analog.current.drive = Math.abs(ny) < dead ? 0 : -ny; // up = forward
  };
  const joyEnd = () => {
    joyId.current = null;
    analog.current = { drive: 0, steer: 0 };
    if (joyKnob.current) joyKnob.current.style.transform = 'translate(0, 0)';
  };

  const tip = cartCount === 0 ? t('tipPick') : t('tipCheckout');
  const iconBtn = 'grid h-11 w-11 select-none place-items-center rounded-md border border-slate-300 bg-white/95 text-xl font-bold text-slate-700 shadow active:bg-brand-100';
  const dockBtn = (active: boolean) =>
    `flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-bold ${active ? 'bg-brand-50 text-brand-700' : 'text-slate-600'}`;
  const toggleSheet = (s: Exclude<Sheet, null>) => setSheet((cur) => (cur === s ? null : s));
  const shelf = aisles[shelfAisle] ?? aisles[0];
  const sheetBox = 'absolute inset-x-0 bottom-14 z-20 mx-auto max-w-2xl rounded-t-lg border border-slate-300 bg-white shadow-2xl';

  // ---------------------------------------------------------------- the full view
  return (
    <div ref={stageRef} className="fixed inset-0 z-[56] h-[100dvh] bg-white" role="dialog" aria-label={t('title')}>
      {/* dir=ltr: the 3D canvas has no text direction; overlays below follow the page direction */}
      <div ref={mountRef} dir="ltr" className="h-full w-full overflow-hidden bg-slate-100" />

      {/* back to the page */}
      <button type="button" onClick={exit} className="absolute start-2 top-2 z-20 flex h-11 items-center gap-1.5 rounded-md border border-slate-300 bg-white/95 px-3 text-sm font-bold text-slate-700 shadow active:bg-brand-100">
        <CloseIcon className="h-5 w-5" />
        {t('backToPage')}
      </button>

      {remainingSeconds != null && (
        <div
          role="timer"
          aria-label={t('timeLeft')}
          title={t('timeLeft')}
          className={`pointer-events-none absolute start-1/2 top-3 -translate-x-1/2 rounded-full px-3 py-1 text-sm font-bold text-white shadow ${
            remainingSeconds <= 60 ? 'bg-red-600' : 'bg-slate-800/85'
          }`}
        >
          ⏱ {minSec(remainingSeconds, locale)}
        </div>
      )}

      <div className="pointer-events-none absolute start-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 ring-1 ring-black/40" aria-hidden />

      {/* zoom + re-center */}
      <div className="absolute end-2 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2 md:end-3">
        <button type="button" className={iconBtn} aria-label={t('zoomIn')} title={t('zoomIn')} onClick={() => ctrl.current?.zoomBy(1.3)}>
          +
        </button>
        <button type="button" className={iconBtn} aria-label={t('zoomOut')} title={t('zoomOut')} onClick={() => ctrl.current?.zoomBy(1 / 1.3)}>
          −
        </button>
        <button type="button" className={iconBtn} aria-label={t('recenter')} title={t('recenter')} onClick={() => ctrl.current?.recenter()}>
          ●
        </button>
      </div>

      {notice && (
        <p className="absolute inset-x-3 bottom-32 mx-auto max-w-md rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 shadow">{t('notOnShelf')}</p>
      )}

      {hover && <p className="pointer-events-none absolute bottom-32 start-1/2 hidden max-w-[60%] -translate-x-1/2 truncate rounded bg-slate-900/80 px-3 py-1 text-sm text-white md:block">{hover}</p>}

      {/* contextual tip (desktop) */}
      {tour === null && (
        <p className="pointer-events-none absolute bottom-32 start-3 hidden max-w-[40%] rounded bg-white/90 px-3 py-1.5 text-xs text-slate-700 shadow md:block">💡 {tip}</p>
      )}

      {/* minimap: a corner widget on desktop, a big tap-to-drive map sheet via the Map button */}
      <div
        className={
          sheet === 'map'
            ? 'absolute inset-x-3 top-1/2 z-30 mx-auto max-w-lg -translate-y-1/2 rounded-md border border-slate-300 bg-white p-2 shadow-2xl'
            : 'absolute end-3 top-3 hidden rounded-md border border-slate-300 bg-white/90 p-1 shadow md:block'
        }
      >
        {sheet === 'map' && (
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-bold">{t('map')}</span>
            <button type="button" onClick={() => setSheet(null)} aria-label={t('close')} className="grid h-9 w-9 place-items-center rounded hover:bg-slate-100">
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
        )}
        <canvas
          ref={mapRef}
          width={336}
          height={240}
          aria-label={t('map')}
          title={t('map')}
          className={`block cursor-pointer ${sheet === 'map' ? 'h-auto w-full' : 'h-[120px] w-[168px]'}`}
          onClick={(e) => {
            const c = e.currentTarget;
            const r = c.getBoundingClientRect();
            ctrl.current?.mapClick(((e.clientX - r.left) * c.width) / r.width, ((e.clientY - r.top) * c.height) / r.height);
            if (sheet === 'map') setSheet(null);
          }}
        />
      </div>

      {/* touch joystick: drag the knob; up = forward, sideways = steer */}
      <div
        ref={joyBase}
        className="absolute bottom-[8.5rem] start-3 hidden h-32 w-32 touch-none select-none rounded-full border border-slate-300 bg-white/50 [@media(pointer:coarse)]:block"
        aria-label={t('joystick')}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          joyId.current = e.pointerId;
          joyMove(e);
        }}
        onPointerMove={(e) => joyId.current === e.pointerId && joyMove(e)}
        onPointerUp={joyEnd}
        onPointerCancel={joyEnd}
      >
        <div ref={joyKnob} className="pointer-events-none absolute start-1/2 top-1/2 -ms-6 -mt-6 grid h-12 w-12 place-items-center rounded-full bg-brand-600 text-white shadow-lg transition-transform duration-75">
          ✥
        </div>
      </div>

      {/* guided tour */}
      {tour !== null && (
        <div role="dialog" aria-label={t('helpButton')} className="absolute inset-x-3 bottom-16 z-20 mx-auto max-w-md rounded-md border border-slate-300 bg-white p-4 shadow-xl">
          <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
            <span>{t('tourStep', { n: tour + 1, total: TOUR_STEPS })}</span>
            <button type="button" onClick={endTour} className="px-2 py-1 font-bold text-slate-500 hover:text-slate-800">
              {t('tourSkip')}
            </button>
          </div>
          <h3 className="font-extrabold">{t(`tour${tour + 1}Title`)}</h3>
          <p className="mt-1 text-sm leading-7 text-slate-600">{t(`tour${tour + 1}Text`)}</p>
          {coarse && tour <= 2 && <p className="mt-1 rounded bg-accent-50 p-2 text-xs leading-6 text-slate-700">📱 {t('tourTouch')}</p>}
          <div className="mt-3 flex items-center justify-between gap-2">
            <button type="button" className="btn-outline h-10 px-4 text-xs" disabled={tour === 0} onClick={() => setTour(tour - 1)}>
              {t('tourPrev')}
            </button>
            <div className="flex gap-1" aria-hidden>
              {Array.from({ length: TOUR_STEPS }, (_, i) => (
                <span key={i} className={`h-1.5 w-3 rounded-sm ${i === tour ? 'bg-brand-600' : 'bg-slate-300'}`} />
              ))}
            </div>
            <button type="button" className="btn h-10 px-4 text-xs" onClick={() => (tour >= TOUR_STEPS - 1 ? endTour() : setTour(tour + 1))}>
              {tour >= TOUR_STEPS - 1 ? t('tourDone') : t('tourNext')}
            </button>
          </div>
        </div>
      )}

      {/* basket strip above the dock */}
      <div className="absolute inset-x-2 bottom-16 mx-auto max-w-lg">
        <div className="flex items-center justify-between gap-2 rounded-md bg-brand-700 px-3 py-2 text-white shadow-lg">
          <span className="flex items-center gap-2 text-sm">
            <CartIcon className="h-5 w-5" />
            {cartCount > 0 ? (
              <b>
                {formatNumber(cartCount, locale)} · {formatNumber(cartTotal, locale)} {tc('currency')}
              </b>
            ) : (
              t('basketEmpty')
            )}
          </span>
          {cartCount > 0 && (
            <button type="button" onClick={() => ctrl.current?.goTo('counter', true)} className="rounded bg-white px-3 py-1.5 text-xs font-bold text-brand-800">
              {t('checkout')}
            </button>
          )}
        </div>
      </div>

      {/* the selected product opens as a bottom sheet */}
      {selected && (
        <div className="absolute inset-x-0 bottom-0 z-30 mx-auto max-w-lg rounded-t-lg bg-white p-3 shadow-2xl">
          <div className="rounded-md border border-slate-300 bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/products/${encodeURIComponent(selected.slug ?? '')}`} className="font-bold hover:text-brand-700">
                {selected.name}
              </Link>
              <button type="button" onClick={() => setSelected(null)} aria-label={t('close')} className="grid h-9 w-9 shrink-0 place-items-center rounded hover:bg-slate-100">
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="my-2">
              <Price price={selected.price} salePrice={selected.salePrice} />
            </div>
            <AddToCart
              productId={selected.id}
              slug={selected.slug ?? ''}
              name={selected.name ?? selected.sku}
              price={selected.salePrice ?? selected.price}
              image={selected.image}
              stock={selected.stock}
            />
          </div>
        </div>
      )}

      {/* panels opened from the dock */}
      {sheet === 'aisles' && (
        <div className={`${sheetBox} flex max-h-[72%] flex-col`}>
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
            <b>{t('dockAisles')}</b>
            <button type="button" onClick={() => setSheet(null)} aria-label={t('close')} className="grid h-9 w-9 place-items-center rounded hover:bg-slate-100">
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto border-b border-slate-100 p-2">
            {aisles.map((a, i) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  setShelfAisle(i);
                  ctrl.current?.goAisle(i); // the trolley parks there while you browse
                }}
                className={`h-10 shrink-0 rounded-full border px-4 text-sm font-bold ${i === shelfAisle ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}
              >
                {a.name}
              </button>
            ))}
          </div>
          <ul className="grid flex-1 grid-cols-2 gap-2 overflow-y-auto p-2 sm:grid-cols-3">
            {shelf?.products.slice(0, MAX_PER_AISLE).map((p) => (
              <li key={p.id} className="flex flex-col gap-1 rounded-md border border-slate-200 p-2">
                <ProductImage src={p.image} alt={p.name ?? p.sku} className="aspect-[4/3] w-full rounded" />
                <span className="line-clamp-2 min-h-[2.4rem] text-[13px] font-medium">{p.name}</span>
                <Price price={p.price} salePrice={p.salePrice} />
                <AddToCart size="compact" productId={p.id} slug={p.slug ?? ''} name={p.name ?? p.sku} price={p.salePrice ?? p.price} image={p.image} stock={p.stock} />
                <button type="button" onClick={() => guideTo(p.id)} className="h-9 rounded-md border border-slate-300 text-xs font-bold text-slate-600">
                  📍 {t('showInStore')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sheet === 'search' && (
        <div className={`${sheetBox} max-h-[72%] overflow-y-auto p-3`}>
          <div className="mb-2 flex items-center gap-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && results[0] && guideTo(results[0].p.id)}
              placeholder={t('findPlaceholder')}
              aria-label={t('find')}
              className="input h-11 text-base"
            />
            <button type="button" onClick={() => setSheet(null)} aria-label={t('close')} className="grid h-11 w-11 shrink-0 place-items-center rounded hover:bg-slate-100">
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
          {norm(query).length >= 2 && results.length === 0 && <p className="p-2 text-sm text-slate-500">{t('noMatch')}</p>}
          <ul className="divide-y divide-slate-100">
            {results.map(({ p, aisle }) => (
              <li key={p.id}>
                <button type="button" onClick={() => guideTo(p.id)} className="flex min-h-12 w-full items-center gap-3 py-2 text-start">
                  <ProductImage src={p.image} alt="" className="h-12 w-12 shrink-0 rounded" />
                  <span className="flex-1 text-sm font-medium">{p.name}</span>
                  <span className="shrink-0 text-xs text-brand-700">{aisle}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sheet === 'more' && (
        <div className={`${sheetBox} p-3`}>
          <div className="mb-2 flex items-center justify-between">
            <b>{t('dockMore')}</b>
            <button type="button" onClick={() => setSheet(null)} aria-label={t('close')} className="grid h-9 w-9 place-items-center rounded hover:bg-slate-100">
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm font-bold">
            <button type="button" className="btn-outline h-11" onClick={() => { setSheet(null); ctrl.current?.goTo('entrance'); }}>
              {t('entrance')}
            </button>
            <button type="button" className="btn-outline h-11" onClick={() => { setSheet(null); ctrl.current?.goTo('counter'); }}>
              {t('counter')}
            </button>
            <button type="button" className="btn-outline h-11" onClick={() => { setSheet(null); setTour(0); }}>
              ? {t('helpButton')}
            </button>
            <button type="button" aria-pressed={sound} className="btn-outline h-11" onClick={() => setSound((v) => !v)}>
              {sound ? t('soundOn') : t('soundOff')}
            </button>
            <button type="button" aria-pressed={low} className="btn-outline h-11" onClick={() => setLow((v) => !v)}>
              {low ? t('highQuality') : t('lowQuality')}
            </button>
            {!coarse && (
              <button type="button" className="btn-outline h-11" onClick={toggleFull}>
                {fs ? t('exitFullscreen') : t('fullscreen')}
              </button>
            )}
            <Link href="/products" className="btn-outline h-11">
              {t('listView')}
            </Link>
            <button type="button" className="btn h-11" onClick={exit}>
              {t('backToPage')}
            </button>
          </div>
        </div>
      )}

      {/* bottom menu */}
      <nav className="absolute inset-x-0 bottom-0 z-20 flex h-14 divide-x divide-slate-200 border-t border-slate-300 bg-white/95 rtl:divide-x-reverse" aria-label={t('title')}>
        <button type="button" className={dockBtn(sheet === 'aisles')} onClick={() => toggleSheet('aisles')}>
          <span aria-hidden className="text-lg">🏬</span>
          {t('dockAisles')}
        </button>
        <button type="button" className={dockBtn(sheet === 'search')} onClick={() => toggleSheet('search')}>
          <span aria-hidden className="text-lg">🔎</span>
          {t('dockSearch')}
        </button>
        <button type="button" className={dockBtn(false)} onClick={() => { setSheet(null); ctrl.current?.goTo('deals'); }}>
          <span aria-hidden className="text-lg">🏷️</span>
          {t('dockOffers')}
        </button>
        <button type="button" className={dockBtn(sheet === 'map')} onClick={() => toggleSheet('map')}>
          <span aria-hidden className="text-lg">🗺️</span>
          {t('dockMap')}
        </button>
        <button type="button" className={dockBtn(sheet === 'more')} onClick={() => toggleSheet('more')}>
          <span aria-hidden className="text-lg">⋯</span>
          {t('dockMore')}
        </button>
      </nav>

      {/* checkout at the counter, without leaving the store */}
      {checkoutOpen && (
        <div className="absolute inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/45 p-2 sm:items-center sm:p-3" onMouseDown={(e) => e.target === e.currentTarget && setCheckoutOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={t('checkoutTitle')} className="w-full max-w-3xl rounded-md bg-white p-3 shadow-2xl sm:p-4">
            <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
              <h2 className="text-lg font-extrabold">🧾 {t('checkoutTitle')}</h2>
              <button type="button" onClick={() => setCheckoutOpen(false)} aria-label={t('close')} className="grid h-10 w-10 place-items-center rounded-md hover:bg-slate-100">
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>

            {cartItems.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-2 text-sm font-bold">{t('checkoutReview')}</h3>
                <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                  {cartItems.map((i) => (
                    <li key={i.productId} className="flex items-center justify-between gap-3 p-2">
                      <span className="line-clamp-1 text-sm">{i.name}</span>
                      <span className="w-36 shrink-0">
                        <AddToCart size="compact" productId={i.productId} slug={i.slug} name={i.name} price={i.price} image={i.image} stock={100} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <CheckoutForm />
          </div>
        </div>
      )}
    </div>
  );
}
