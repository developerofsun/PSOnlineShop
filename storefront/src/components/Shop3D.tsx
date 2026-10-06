'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Link } from '@/i18n/navigation';
import type { ProductListItem } from '@/lib/types';
import AddToCart from './AddToCart';
import { CloseIcon } from './icons';
import Price from './Price';

export type Aisle = { id: number; name: string; products: ProductListItem[] };

const GAP = 6; // distance between aisles
const SHELF_W = 4.4;
const SHELF_H = 3.6;
const SHELF_D = 1.1;
const PLANKS = [0.15, 1.3, 2.45];
const PER_ROW = 4;
const BOX = { w: 0.85, h: 1.0, d: 0.6 };

const aisleX = (i: number, n: number) => (i - (n - 1) / 2) * GAP;
const hue = (id: number) => (id * 47) % 360;

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

/** Front label of a product box: picture (when it loads) over a colored card with the name and price. */
function makeLabel(p: ProductListItem, priceText: string, rtl: boolean) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 300;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const draw = (img?: HTMLImageElement) => {
    ctx.fillStyle = `hsl(${hue(p.id)} 45% 88%)`;
    ctx.fillRect(0, 0, 256, 300);
    if (img) {
      // cover-fit into the picture area
      const area = { w: 256, h: 190 };
      const s = Math.max(area.w / img.width, area.h / img.height);
      const dw = img.width * s;
      const dh = img.height * s;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, area.w, area.h);
      ctx.clip();
      ctx.drawImage(img, (area.w - dw) / 2, (area.h - dh) / 2, dw, dh);
      ctx.restore();
    } else {
      ctx.fillStyle = `hsl(${hue(p.id)} 40% 45%)`;
      ctx.font = 'bold 96px "Vazirmatn Variable", Tahoma, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((p.name ?? '?').trim().charAt(0), 128, 95);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 190, 256, 110);
    ctx.fillStyle = '#1e293b';
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 22px "Vazirmatn Variable", Tahoma, sans-serif';
    wrap(ctx, p.name ?? p.sku, 128, 198, 232, 28, 2);
    ctx.fillStyle = '#237030';
    ctx.font = 'bold 24px "Vazirmatn Variable", Tahoma, sans-serif';
    ctx.fillText(priceText, 128, 262);
    texture.needsUpdate = true;
  };

  draw();
  if (p.image) {
    const img = new Image();
    img.onload = () => draw(img);
    img.src = p.image; // same-origin (/uploads is proxied), so the canvas is never tainted
  }
  return texture;
}

function makeSign(text: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#2e8b3d';
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 54px "Vazirmatn Variable", Tahoma, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 68, 480);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Walk-around 3D store: one shelf unit per category, products on the shelves. Click a product to pick it. */
export default function Shop3D({ aisles }: { aisles: Aisle[] }) {
  const t = useTranslations('shop3d');
  const tc = useTranslations('common');
  const locale = useLocale();
  const mountRef = useRef<HTMLDivElement>(null);
  const flyRef = useRef<(i: number) => void>(() => {});
  const [selected, setSelected] = useState<ProductListItem | null>(null);
  const [noWebgl, setNoWebgl] = useState(false);
  const [active, setActive] = useState(-1);

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
    const n = aisles.length;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeef3ee);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    const overview = { pos: new THREE.Vector3(0, 4.8, 9 + n * 0.9), target: new THREE.Vector3(0, 1.6, 0) };
    camera.position.copy(overview.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(overview.target);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.05; // never go under the floor
    controls.minDistance = 2.5;
    controls.maxDistance = 30;
    controls.update();

    scene.add(new THREE.HemisphereLight(0xffffff, 0xb6c8b6, 1.15));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(5, 10, 8);
    scene.add(sun);

    // floor tiles + back wall
    const floorW = n * GAP + 14;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(floorW, 26), new THREE.MeshStandardMaterial({ color: 0xdfe4dc }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const grid = new THREE.GridHelper(floorW, Math.round(floorW), 0xc3cbc0, 0xd0d7cd);
    grid.position.y = 0.01;
    scene.add(grid);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(floorW, 9), new THREE.MeshStandardMaterial({ color: 0xf7f7f2 }));
    wall.position.set(0, 4.5, -4.5);
    scene.add(wall);

    const wood = new THREE.MeshStandardMaterial({ color: 0x8d6e4b });
    const back = new THREE.MeshStandardMaterial({ color: 0xf1efe7 });
    const pickables: THREE.Mesh[] = [];

    aisles.forEach((aisle, ai) => {
      const cx = aisleX(ai, n);
      const g = new THREE.Group();
      g.position.x = cx;

      const backPanel = new THREE.Mesh(new THREE.BoxGeometry(SHELF_W, SHELF_H, 0.06), back);
      backPanel.position.set(0, SHELF_H / 2, -SHELF_D / 2);
      g.add(backPanel);
      for (const side of [-1, 1]) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.1, SHELF_H, SHELF_D), wood);
        s.position.set((side * SHELF_W) / 2, SHELF_H / 2, 0);
        g.add(s);
      }
      for (const y of [...PLANKS, SHELF_H]) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(SHELF_W, 0.08, SHELF_D), wood);
        plank.position.set(0, y, 0);
        g.add(plank);
      }

      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(3.2, 0.8),
        new THREE.MeshBasicMaterial({ map: makeSign(aisle.name) }),
      );
      sign.position.set(0, SHELF_H + 0.75, 0.1);
      g.add(sign);

      aisle.products.slice(0, PLANKS.length * PER_ROW).forEach((p, k) => {
        const row = Math.floor(k / PER_ROW);
        const col = k % PER_ROW;
        const plain = new THREE.MeshStandardMaterial({ color: new THREE.Color(`hsl(${hue(p.id)}, 40%, 80%)`) });
        const front = new THREE.MeshStandardMaterial({
          map: makeLabel(p, `${nf.format(p.salePrice ?? p.price)} ${tc('currency')}`, rtl),
        });
        // BoxGeometry face order: +x, -x, +y, -y, +z (front), -z
        const box = new THREE.Mesh(new THREE.BoxGeometry(BOX.w, BOX.h, BOX.d), [plain, plain, plain, plain, front, plain]);
        box.position.set(-SHELF_W / 2 + 0.6 + col * 1.05, PLANKS[row] + 0.04 + BOX.h / 2, 0.08);
        box.userData = { product: p };
        pickables.push(box);
        g.add(box);
      });
      scene.add(g);
    });

    // ---- sizing
    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // ---- camera fly-to (instant when the user prefers reduced motion)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let fly: { t0: number; fromP: THREE.Vector3; fromT: THREE.Vector3; toP: THREE.Vector3; toT: THREE.Vector3 } | null = null;
    flyRef.current = (i: number) => {
      const toP = i < 0 ? overview.pos.clone() : new THREE.Vector3(aisleX(i, n), 2.3, 5.4);
      const toT = i < 0 ? overview.target.clone() : new THREE.Vector3(aisleX(i, n), 1.9, 0);
      if (reduce) {
        camera.position.copy(toP);
        controls.target.copy(toT);
        return;
      }
      fly = { t0: performance.now(), fromP: camera.position.clone(), fromT: controls.target.clone(), toP, toT };
    };

    // ---- picking: hover highlight and click (a drag is not a click)
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let hovered: THREE.Mesh | null = null;
    const pick = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return (ray.intersectObjects(pickables, false)[0]?.object as THREE.Mesh | undefined) ?? null;
    };
    const onMove = (e: PointerEvent) => {
      if (e.buttons) return;
      const hit = pick(e);
      if (hit !== hovered) {
        hovered?.scale.setScalar(1);
        hovered = hit;
        hovered?.scale.setScalar(1.07);
        renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
      }
    };
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5;
      down = null;
      if (moved) return;
      const hit = pick(e);
      if (hit) setSelected(hit.userData.product as ProductListItem);
    };
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);

    // ---- loop
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (fly) {
        const k = Math.min((performance.now() - fly.t0) / 700, 1);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // ease in-out
        camera.position.lerpVectors(fly.fromP, fly.toP, e);
        controls.target.lerpVectors(fly.fromT, fly.toT, e);
        if (k >= 1) fly = null;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mat of mats) {
          (mat as THREE.MeshStandardMaterial).map?.dispose();
          mat.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [aisles, locale, tc]);

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

  const go = (i: number) => {
    setActive(i);
    flyRef.current(i);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => go(-1)} className={active === -1 ? 'btn h-9' : 'btn-outline h-9'}>
          {t('overview')}
        </button>
        {aisles.map((a, i) => (
          <button key={a.id} type="button" onClick={() => go(i)} className={active === i ? 'btn h-9' : 'btn-outline h-9'}>
            {a.name}
          </button>
        ))}
        <Link href="/products" className="ms-auto text-sm font-bold text-brand-700 hover:underline">
          {t('listView')}
        </Link>
      </div>

      <div className="relative">
        {/* dir=ltr: the 3D canvas has no text direction; overlays below follow the page direction */}
        <div ref={mountRef} dir="ltr" className="h-[68vh] min-h-[420px] w-full overflow-hidden rounded-md border border-slate-300 bg-slate-100" />
        <p className="pointer-events-none absolute start-3 top-3 rounded bg-white/90 px-2 py-1 text-xs text-slate-600">{t('hint')}</p>

        {selected && (
          <div className="absolute inset-x-3 bottom-3 rounded-md border border-slate-300 bg-white p-3 shadow-lg sm:inset-x-auto sm:end-3 sm:w-80">
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
      </div>
    </div>
  );
}
