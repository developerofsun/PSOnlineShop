'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import * as THREE from 'three';
import { Link, useRouter } from '@/i18n/navigation';
import { useCart } from '@/lib/cart';
import { formatNumber } from '@/lib/format';
import type { ProductListItem } from '@/lib/types';
import AddToCart from './AddToCart';
import { CartIcon, CloseIcon } from './icons';
import Price from './Price';

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
const RADIUS = 0.35;
const SPEED = 2.4;
const MAX_PER_AISLE = 18;

const hue = (id: number) => (id * 47) % 360;

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

function makeSign(text: string, bg: string, w = 512, h = 128, size = 54) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 4, w - 40);
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
  goHome: () => void;
  mapClick: (px: number, py: number) => void;
  setLow: (low: boolean) => void;
};

/**
 * Walk-through 3D store. First person: WASD / arrow keys, drag to look, click the floor to walk, click a product to
 * pick it. The basket in front of you mirrors the real cart; the counter at the entrance opens the checkout.
 */
export default function Shop3D({ aisles, storeName, findId = null }: { aisles: Aisle[]; storeName: string; findId?: number | null }) {
  const t = useTranslations('shop3d');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const mountRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const ctrl = useRef<Ctrl | null>(null);
  const keys = useRef(new Set<string>());

  const [selected, setSelected] = useState<ProductListItem | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [noWebgl, setNoWebgl] = useState(false);
  const [help, setHelp] = useState(true);
  const [low, setLow] = useState(false);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState(false);

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

  const counterLabel = t('counter');
  const currency = tc('currency');
  const cartItems = useCart((s) => s.items);
  const cartCount = cartItems.reduce((n, i) => n + i.qty, 0);
  const cartTotal = cartItems.reduce((n, i) => n + i.qty * i.price, 0);

  useEffect(() => ctrl.current?.setLow(low), [low]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setNoWebgl(true);
      return;
    }

    const rtl = locale === 'fa';
    const nf = new Intl.NumberFormat(rtl ? 'fa-IR' : 'en-US');
    const lay: Layout = computeLayout(aisles);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let lowQ = false;
    const applyRatio = () => renderer.setPixelRatio(lowQ ? 1 : Math.min(window.devicePixelRatio, 2));
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
    const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 80);
    camera.rotation.order = 'YXZ';
    scene.add(camera); // so the basket (a child of the camera) is traversed and disposed with the scene

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
    const base = new THREE.Mesh(new THREE.BoxGeometry(W, 0.12, 0.04), mat(0x2e8b3d)); // green skirting on the back wall
    base.position.set(0, 0.06, -D / 2 + 0.02);
    scene.add(base);

    const storeSign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.3), new THREE.MeshBasicMaterial({ map: makeSign(storeName, '#2e8b3d', 768, 166, 78) }));
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
      const signTex = makeSign(aisle.name, '#2e8b3d');
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
      scene.add(grp);
    });

    // checkout counter near the entrance
    const counter = new THREE.Group();
    counter.position.set(lay.counterC.x, 0, lay.counterC.z);
    const desk = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.95, 0.9), mat(0x2e8b3d));
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
    pickables.push(desk, deskTop);
    const counterSign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshBasicMaterial({ map: makeSign(counterLabel, '#e08600', 512, 128, 60) }));
    counterSign.position.set(0, 2.2, 0);
    counter.add(counterSign);
    scene.add(counter);

    // ---------------------------------------------------------------- the basket you carry (drawn on top of everything)
    const basket = new THREE.Group();
    basket.position.set(0.3, -0.34, -0.72);
    basket.rotation.set(0.5, -0.25, 0);
    const basketMat = new THREE.MeshStandardMaterial({ color: 0xd9482b, depthTest: false });
    const addPart = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), basketMat);
      m.position.set(x, y, z);
      m.renderOrder = 999;
      basket.add(m);
    };
    addPart(0.36, 0.03, 0.24, 0, 0, 0);
    addPart(0.36, 0.14, 0.02, 0, 0.085, 0.12);
    addPart(0.36, 0.14, 0.02, 0, 0.085, -0.12);
    addPart(0.02, 0.14, 0.24, 0.18, 0.085, 0);
    addPart(0.02, 0.14, 0.24, -0.18, 0.085, 0);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.011, 8, 24, Math.PI), basketMat);
    handle.position.y = 0.155;
    handle.renderOrder = 999;
    basket.add(handle);
    const basketItems = new THREE.Group();
    basketItems.position.y = 0.03;
    basket.add(basketItems);
    camera.add(basket);

    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const renderBasket = () => {
      for (const c of [...basketItems.children]) {
        ((c as THREE.Mesh).material as THREE.Material).dispose();
        basketItems.remove(c);
      }
      const ids: number[] = [];
      for (const i of useCart.getState().items) for (let q = 0; q < Math.min(i.qty, 3); q++) ids.push(i.productId);
      ids.slice(0, 14).forEach((id, k) => {
        const m = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: new THREE.Color(`hsl(${hue(id)}, 55%, 62%)`), depthTest: false }));
        const col = k % 4;
        const row = Math.floor(k / 4) % 2;
        const layer = Math.floor(k / 8);
        m.scale.set(0.07, 0.09 + (id % 3) * 0.015, 0.06);
        m.position.set(-0.12 + col * 0.08, 0.06 + layer * 0.09, -0.04 + row * 0.08);
        m.rotation.y = ((id * 37 + k * 11) % 40) / 100 - 0.2;
        m.renderOrder = 1000;
        basketItems.add(m);
      });
    };

    type Flyer = { mesh: THREE.Mesh; t0: number };
    const flyers: Flyer[] = [];
    const FLY_MS = 380;
    const FROM = new THREE.Vector3(0, -0.02, -0.55);
    const TO = new THREE.Vector3(0.3, -0.2, -0.72);
    const spawnFlyer = (productId: number) => {
      const mesh = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: new THREE.Color(`hsl(${hue(productId)}, 55%, 62%)`), depthTest: false }));
      mesh.scale.set(0.09, 0.11, 0.07);
      mesh.renderOrder = 1001;
      mesh.position.copy(FROM);
      camera.add(mesh);
      flyers.push({ mesh, t0: performance.now() });
    };

    let ready = false; // ignore the cart being restored from storage at load
    const readyTimer = setTimeout(() => (ready = true), 900);
    let prevCart = new Map(useCart.getState().items.map((i) => [i.productId, i.qty]));
    renderBasket();
    const unsub = useCart.subscribe((s) => {
      const cur = new Map(s.items.map((i) => [i.productId, i.qty]));
      let added: number | null = null;
      for (const [id, q] of cur) if (q > (prevCart.get(id) ?? 0)) added = id;
      prevCart = cur;
      if (added != null && ready && !reduce) spawnFlyer(added);
      else renderBasket();
    });

    // ---------------------------------------------------------------- player + movement
    const pos = { x: lay.start.x, z: lay.start.z };
    let yaw = 0;
    let pitch = -0.08;
    let yawGoal: number | null = null;
    let path: { x: number; z: number }[] = [];
    let finalYaw: number | null = null;

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
    const tryMove = (nx: number, nz: number) => {
      if (!blocked(nx, pos.z)) pos.x = nx;
      if (!blocked(pos.x, nz)) pos.z = nz;
    };

    const walkCenters = Array.from({ length: n + 1 }, (_, k) => (k - n / 2) * SPACING);
    const nearestWalk = (x: number) => walkCenters.reduce((b, c) => (Math.abs(c - x) < Math.abs(b - x) ? c : b), walkCenters[0]);
    const inSpan = (z: number) => z >= lay.spanMin && z <= lay.spanMax;
    const lane = (x: number) => {
      const c = nearestWalk(x);
      return Math.abs(x - c) <= (SPACING - GOND_D) / 2 ? c : null;
    };

    /** Walk to (tx,tz) using the corridors, so the straight line never cuts through a shelf. */
    const routeTo = (tx: number, tz: number, endYaw: number | null = null, guided = false) => {
      if (blocked(tx, tz)) return;
      if (reduce) {
        pos.x = tx;
        pos.z = tz;
        if (endYaw != null) yaw = endYaw;
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
      finalYaw = endYaw;
      yawGoal = null;
      if (guided) buildTrail(pts);
      else clearTrail();
    };

    const goAisle = (i: number, side: 1 | -1 = 1, z = GZ, guided = false) => {
      const g = lay.gondolas[i];
      if (!g) return;
      routeTo(g.gx + side * (SPACING / 2), z, side === 1 ? Math.PI / 2 : -Math.PI / 2, guided);
    };
    const goHome = () => routeTo(lay.start.x, lay.start.z, 0);

    // arrow above the product the assistant is guiding you to
    let beacon: THREE.Mesh | null = null;
    let beaconBase = 0;
    let beaconUntil = 0;
    const guide = (productId: number) => {
      const box = pickables.find((m) => m.userData.product?.id === productId);
      if (!box) return false;
      const wp = new THREE.Vector3();
      box.getWorldPosition(wp);
      goAisle(box.userData.aisle as number, box.userData.side as 1 | -1, wp.z, true); // stand right in front of it
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
      ctx.fillStyle = '#2e8b3d';
      for (const g of lay.gondolas) ctx.fillRect(X(g.minX), Z(g.minZ), (g.maxX - g.minX) * s, (g.maxZ - g.minZ) * s);
      ctx.fillStyle = '#e08600';
      ctx.fillRect(X(lay.counter.minX), Z(lay.counter.minZ), (lay.counter.maxX - lay.counter.minX) * s, (lay.counter.maxZ - lay.counter.minZ) * s);
      // player
      const px = X(pos.x);
      const pz = Z(pos.z);
      ctx.strokeStyle = '#d32f2f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, pz);
      ctx.lineTo(px - Math.sin(yaw) * 11, pz - Math.cos(yaw) * 11);
      ctx.stroke();
      ctx.fillStyle = '#d32f2f';
      ctx.beginPath();
      ctx.arc(px, pz, 3.5, 0, Math.PI * 2);
      ctx.fill();
    };
    const mapClick = (px: number, py: number) => {
      const x = (px - mm.ox) / mm.s - W / 2;
      const z = (py - mm.oy) / mm.s - D / 2;
      const gi = lay.gondolas.findIndex((g) => x > g.minX - 1 && x < g.maxX + 1 && z > g.minZ - 0.5 && z < g.maxZ + 0.5);
      if (gi >= 0) goAisle(gi, x >= lay.gondolas[gi].gx ? 1 : -1);
      else routeTo(x, z);
    };

    ctrl.current = {
      guide,
      goAisle,
      goHome,
      mapClick,
      setLow: (v) => {
        lowQ = v;
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

    // ---------------------------------------------------------------- input: look (drag), tap (pick / walk), hover
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const cast = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
    };
    let hovered: THREE.Mesh | null = null;
    let hoverKey = '';
    const onHover = (e: PointerEvent) => {
      cast(e);
      const hit = ray.intersectObjects(pickables, false)[0];
      const obj = (hit?.object as THREE.Mesh | undefined) ?? null;
      if (obj !== hovered) {
        hovered?.scale.setScalar(1);
        hovered = obj;
        if (obj?.userData.product) obj.scale.setScalar(1.05);
        el.style.cursor = obj ? 'pointer' : 'grab';
      }
      const key = obj ? (obj.userData.checkout ? 'checkout' : String(obj.userData.product.id)) : '';
      if (key !== hoverKey) {
        hoverKey = key;
        setHover(!obj ? null : obj.userData.checkout ? counterLabel : (obj.userData.product as ProductListItem).name);
      }
    };
    const onTap = (e: PointerEvent) => {
      cast(e);
      const hit = ray.intersectObjects(pickables, false)[0];
      if (hit) {
        const u = hit.object.userData;
        if (u.checkout) {
          routerRef.current.push('/checkout');
          return;
        }
        setSelected(u.product as ProductListItem);
        if (hit.distance > 5) goAisle(u.aisle as number, u.side as 1 | -1); // too far to reach: walk over
        return;
      }
      setSelected(null);
      const f = ray.intersectObject(floor)[0];
      if (f) routeTo(f.point.x, f.point.z);
    };

    let drag: { id: number; x: number; y: number; sx: number; sy: number; moved: boolean } | null = null;
    const dismissHelp = () => setHelp(false);
    const onDown = (e: PointerEvent) => {
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
      el.setPointerCapture(e.pointerId);
      dismissHelp();
    };
    const onMove = (e: PointerEvent) => {
      if (drag && drag.id === e.pointerId) {
        if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) drag.moved = true;
        if (drag.moved) {
          // the world follows the finger: dragging right turns the view left
          yaw += (e.clientX - drag.x) * 0.0045;
          pitch = Math.max(-0.9, Math.min(0.9, pitch + (e.clientY - drag.y) * 0.0045));
          yawGoal = null;
          el.style.cursor = 'grabbing';
        }
        drag.x = e.clientX;
        drag.y = e.clientY;
      } else if (e.pointerType === 'mouse') onHover(e);
    };
    const onUp = (e: PointerEvent) => {
      if (drag && drag.id === e.pointerId && !drag.moved) onTap(e);
      drag = null;
      el.style.cursor = hovered ? 'pointer' : 'grab';
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);

    // ---------------------------------------------------------------- input: keyboard
    const MAP: Record<string, string> = {
      w: 'f', W: 'f', ArrowUp: 'f', s: 'b', S: 'b', ArrowDown: 'b', a: 'l', A: 'l', d: 'r', D: 'r', ArrowLeft: 'tl', ArrowRight: 'tr',
    };
    const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]');
    const onKeyDown = (e: KeyboardEvent) => {
      const k = MAP[e.key];
      if (!k || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      keys.current.add(k);
      dismissHelp();
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
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const k = keys.current;

      // turning with the arrow keys
      const turn = (k.has('tl') ? 1 : 0) - (k.has('tr') ? 1 : 0);
      if (turn) {
        yaw += turn * 1.9 * dt;
        yawGoal = null;
      }

      // walking
      const f = (k.has('f') ? 1 : 0) - (k.has('b') ? 1 : 0);
      const r = (k.has('r') ? 1 : 0) - (k.has('l') ? 1 : 0);
      let moving = false;
      if (f || r) {
        path = [];
        clearTrail();
        const len = Math.hypot(f, r);
        const fx = -Math.sin(yaw);
        const fz = -Math.cos(yaw);
        const rx = Math.cos(yaw);
        const rz = -Math.sin(yaw);
        tryMove(pos.x + ((fx * f + rx * r) / len) * SPEED * dt, pos.z + ((fz * f + rz * r) / len) * SPEED * dt);
        moving = true;
      } else if (path.length) {
        const head = path[0];
        const dx = head.x - pos.x;
        const dz = head.z - pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.12) {
          path.shift();
          if (!path.length) {
            clearTrail();
            if (finalYaw != null) yawGoal = finalYaw;
          }
        } else {
          const step = Math.min(d, SPEED * dt);
          const bx = pos.x;
          const bz = pos.z;
          tryMove(pos.x + (dx / d) * step, pos.z + (dz / d) * step);
          moving = true;
          stuck = Math.hypot(pos.x - bx, pos.z - bz) < step * 0.2 ? stuck + 1 : 0;
          if (stuck > 12) {
            path = []; // wedged against something: give up this walk
            clearTrail();
            stuck = 0;
          }
        }
      }

      if (yawGoal != null) {
        let diff = ((yawGoal - yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
        if (diff < -Math.PI) diff += Math.PI * 2;
        yaw += diff * Math.min(1, dt * 6);
        pitch *= 1 - Math.min(1, dt * 4);
        if (Math.abs(diff) < 0.01) yawGoal = null;
      }

      camera.position.set(pos.x, EYE + (moving && !reduce ? Math.sin(now / 110) * 0.022 : 0), pos.z);
      camera.rotation.set(pitch, yaw, 0);

      // items dropping into the basket
      for (let i = flyers.length - 1; i >= 0; i--) {
        const fl = flyers[i];
        const kk = Math.min((now - fl.t0) / FLY_MS, 1);
        fl.mesh.position.lerpVectors(FROM, TO, kk);
        fl.mesh.position.y += Math.sin(kk * Math.PI) * 0.16;
        if (kk >= 1) {
          camera.remove(fl.mesh);
          (fl.mesh.material as THREE.Material).dispose();
          flyers.splice(i, 1);
          renderBasket();
        }
      }

      if (beacon?.visible) {
        if (now > beaconUntil) beacon.visible = false;
        else beacon.position.y = beaconBase + (reduce ? 0 : Math.sin(now / 220) * 0.06);
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
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      keys.current.clear();
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
      renderer.dispose();
      el.remove();
    };
  }, [aisles, locale, counterLabel, currency, storeName, findId]);

  if (noWebgl) {
    return (
      <div className="card p-8 text-center">
        <p className="mb-4 text-slate-600">{t('noWebgl')}</p>
        <Link href="/products" className="btn">
          {t('listView')}
        </Link>
      </div>
    );
  }

  const press = (k: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      keys.current.add(k);
      setHelp(false);
    },
    onPointerUp: () => keys.current.delete(k),
    onPointerLeave: () => keys.current.delete(k),
    onPointerCancel: () => keys.current.delete(k),
  });
  const pad = 'grid h-12 w-12 select-none place-items-center rounded-md bg-white/90 text-lg font-bold text-slate-700 shadow active:bg-brand-100';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => ctrl.current?.goHome()} className="btn-outline h-9">
          {t('entrance')}
        </button>
        {aisles.map((a, i) => (
          <button key={a.id} type="button" onClick={() => ctrl.current?.goAisle(i)} className="btn-outline h-9">
            {a.name}
          </button>
        ))}
        <form
          className="relative w-full sm:w-64"
          onSubmit={(e) => {
            e.preventDefault();
            if (results[0]) {
              setNotice(false);
              ctrl.current?.guide(results[0].p.id);
              setQuery('');
            }
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('findPlaceholder')}
            aria-label={t('find')}
            className="input h-9"
          />
          {norm(query).length >= 2 && (
            <ul className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
              {results.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">{t('noMatch')}</li>}
              {results.map(({ p, aisle }) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm hover:bg-brand-50"
                    onClick={() => {
                      setNotice(false);
                      ctrl.current?.guide(p.id);
                      setQuery('');
                    }}
                  >
                    <span className="line-clamp-1">{p.name}</span>
                    <span className="shrink-0 text-xs text-brand-700">{aisle}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
        <button type="button" onClick={() => setLow((v) => !v)} aria-pressed={low} className={`h-9 rounded-md border px-3 text-xs font-bold ${low ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-300 bg-white text-slate-600'}`}>
          {low ? t('highQuality') : t('lowQuality')}
        </button>
        <Link href="/products" className="ms-auto text-sm font-bold text-brand-700 hover:underline">
          {t('listView')}
        </Link>
      </div>

      <div className="relative">
        {/* dir=ltr: the 3D canvas has no text direction; overlays below follow the page direction */}
        <div ref={mountRef} dir="ltr" className="h-[72vh] min-h-[460px] w-full overflow-hidden rounded-md border border-slate-300 bg-slate-100" />
        <div className="pointer-events-none absolute start-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 ring-1 ring-black/40" aria-hidden />

        {notice && (
          <p className="absolute inset-x-3 bottom-16 mx-auto max-w-md rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 shadow">
            {t('notOnShelf')}
          </p>
        )}

        {hover && <p className="pointer-events-none absolute bottom-3 start-1/2 max-w-[60%] -translate-x-1/2 truncate rounded bg-slate-900/80 px-3 py-1 text-sm text-white">{hover}</p>}

        {help && (
          <div className="absolute inset-x-3 top-3 mx-auto max-w-md rounded-md border border-slate-300 bg-white/95 p-3 text-sm shadow-lg">
            <p className="mb-1 font-bold">{t('helpTitle')}</p>
            <ul className="space-y-0.5 text-slate-600">
              <li>• {t('helpMove')}</li>
              <li>• {t('helpLook')}</li>
              <li>• {t('helpWalk')}</li>
              <li>• {t('helpPick')}</li>
            </ul>
            <button type="button" onClick={() => setHelp(false)} className="btn mt-2 h-8 px-3 text-xs">
              {t('gotIt')}
            </button>
          </div>
        )}

        <div className="absolute end-3 top-3 rounded-md border border-slate-300 bg-white/90 p-1 shadow">
          <canvas
            ref={mapRef}
            width={168}
            height={120}
            aria-label={t('map')}
            title={t('map')}
            className="block h-[120px] w-[168px] cursor-pointer"
            onClick={(e) => {
              const c = e.currentTarget;
              const r = c.getBoundingClientRect();
              ctrl.current?.mapClick(((e.clientX - r.left) * c.width) / r.width, ((e.clientY - r.top) * c.height) / r.height);
            }}
          />
        </div>

        {/* touch controls: only on devices whose main input is a finger */}
        <div className="absolute bottom-3 start-3 hidden grid-cols-3 gap-1 [@media(pointer:coarse)]:grid">
          <span />
          <button type="button" aria-label={t('forward')} className={pad} {...press('f')}>▲</button>
          <span />
          <button type="button" aria-label={t('turnLeft')} className={pad} {...press('tl')}>◀</button>
          <button type="button" aria-label={t('back')} className={pad} {...press('b')}>▼</button>
          <button type="button" aria-label={t('turnRight')} className={pad} {...press('tr')}>▶</button>
        </div>

        <div className="absolute bottom-3 end-3 flex w-72 max-w-[calc(100%-1.5rem)] flex-col gap-2">
          {selected && (
            <div className="rounded-md border border-slate-300 bg-white p-3 shadow-lg">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/products/${encodeURIComponent(selected.slug ?? '')}`} className="font-bold hover:text-brand-700">
                  {selected.name}
                </Link>
                <button type="button" onClick={() => setSelected(null)} aria-label={t('close')} className="grid h-7 w-7 shrink-0 place-items-center rounded hover:bg-slate-100">
                  <CloseIcon className="h-4 w-4" />
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
          )}

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
              <Link href="/checkout" className="rounded bg-white px-2.5 py-1 text-xs font-bold text-brand-800">
                {t('checkout')}
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
