export type Watermark = {
  enabled: boolean;
  kind: 'text' | 'image';
  text: string;
  imageUrl: string;
  /** Centre of the watermark as a fraction (0..1) of the image, so it applies to images of any size. */
  x: number;
  y: number;
  /** Watermark width as a fraction of the image width. */
  size: number;
  opacity: number;
  /** Degrees, -180..180. */
  rotation: number;
  /** Repeat across the whole image (hardest to crop out). */
  tile: boolean;
};

export type EditSettings = {
  removeBg: boolean;
  /** color = fast flood fill for plain backdrops; ai = in-browser neural model for any background. */
  bgMode: 'color' | 'ai';
  bgColor: [number, number, number];
  bgTolerance: number;
  bgFeather: number;
  /** Fill transparent areas with this colour when set (null keeps transparency). */
  fillColor: string | null;
  rotate: 0 | 90 | 180 | 270;
  flipH: boolean;
  brightness: number;
  contrast: number;
  saturation: number;
  /** Output as a square with padding, useful for uniform product grids. */
  square: boolean;
  maxSide: number;
  quality: number;
  watermark: Watermark;
};

export const defaultSettings = (): EditSettings => ({
  removeBg: false,
  bgMode: 'color',
  bgColor: [255, 255, 255],
  bgTolerance: 30,
  bgFeather: 1,
  fillColor: null,
  rotate: 0,
  flipH: false,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  square: false,
  maxSide: 1600,
  quality: 0.85,
  watermark: {
    enabled: false,
    kind: 'text',
    text: '',
    imageUrl: '',
    x: 0.5,
    y: 0.5,
    size: 0.3,
    opacity: 0.4,
    rotation: -30,
    tile: false,
  },
});

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('بارگذاری تصویر ناموفق بود'));
    img.src = src;
  });
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/**
 * Makes pixels that are connected to the image border and close to `target` transparent (flood fill),
 * so a white/plain studio backdrop is cut out without eating same-coloured areas inside the product.
 */
function cutBackground(canvas: HTMLCanvasElement, target: [number, number, number], tolerance: number, feather: number) {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const maxDist = tolerance * 4.4; // 0..100 -> 0..440 (max euclidean RGB distance is ~441)
  const match = (p: number) => {
    const dr = d[p] - target[0];
    const dg = d[p + 1] - target[1];
    const db = d[p + 2] - target[2];
    return Math.sqrt(dr * dr + dg * dg + db * db) <= maxDist;
  };

  const visited = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const i = y * w + x;
    if (!visited[i] && match(i * 4)) {
      visited[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  for (let i = 0; i < visited.length; i++) if (visited[i]) d[i * 4 + 3] = 0;
  ctx.putImageData(img, 0, 0);

  if (feather > 0) {
    // Soften the cut edge: blur only the alpha channel by redrawing through a blur filter.
    const soft = makeCanvas(w, h);
    const sctx = soft.getContext('2d')!;
    sctx.filter = `blur(${feather}px)`;
    sctx.drawImage(canvas, 0, 0);
    const blurred = sctx.getImageData(0, 0, w, h).data;
    const out = ctx.getImageData(0, 0, w, h);
    for (let i = 3; i < out.data.length; i += 4) out.data[i] = Math.min(out.data[i], blurred[i]);
    ctx.putImageData(out, 0, 0);
  }
}

function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number, wm: Watermark, logo: HTMLImageElement | null) {
  if (!wm.enabled) return;
  const drawOne = (cx: number, cy: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((wm.rotation * Math.PI) / 180);
    ctx.globalAlpha = wm.opacity;
    const targetW = w * wm.size;
    if (wm.kind === 'image' && logo) {
      const targetH = (logo.naturalHeight / logo.naturalWidth) * targetW;
      ctx.drawImage(logo, -targetW / 2, -targetH / 2, targetW, targetH);
    } else if (wm.kind === 'text' && wm.text.trim()) {
      let fontSize = targetW / Math.max(wm.text.length * 0.55, 1);
      fontSize = Math.max(fontSize, 10);
      ctx.font = `700 ${fontSize}px Vazirmatn, Tahoma, Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(fontSize / 14, 1);
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.fillStyle = '#fff';
      ctx.strokeText(wm.text, 0, 0);
      ctx.fillText(wm.text, 0, 0);
    }
    ctx.restore();
  };

  if (wm.tile) {
    const step = Math.max(w * wm.size * 1.6, 80);
    for (let y = step / 2; y < h + step; y += step) {
      for (let x = step / 2 + (Math.round(y / step) % 2 ? step / 2 : 0); x < w + step; x += step) drawOne(x, y);
    }
  } else {
    drawOne(wm.x * w, wm.y * h);
  }
}

/** Renders the edited image to a canvas. Used for both the live preview (small maxSide) and the final export. */
export function renderEdited(src: HTMLImageElement, s: EditSettings, logo: HTMLImageElement | null, maxSide = s.maxSide): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(src.naturalWidth, src.naturalHeight));
  const sw = src.naturalWidth * scale;
  const sh = src.naturalHeight * scale;
  const swap = s.rotate === 90 || s.rotate === 270;

  const base = makeCanvas(swap ? sh : sw, swap ? sw : sh);
  const bctx = base.getContext('2d', { willReadFrequently: true })!;
  bctx.save();
  bctx.translate(base.width / 2, base.height / 2);
  bctx.rotate((s.rotate * Math.PI) / 180);
  if (s.flipH) bctx.scale(-1, 1);
  bctx.filter = `brightness(${s.brightness}%) contrast(${s.contrast}%) saturate(${s.saturation}%)`;
  bctx.drawImage(src, -sw / 2, -sh / 2, sw, sh);
  bctx.restore();

  if (s.removeBg) cutBackground(base, s.bgColor, s.bgTolerance, s.bgFeather);

  const side = Math.max(base.width, base.height);
  const out = s.square ? makeCanvas(side, side) : makeCanvas(base.width, base.height);
  const octx = out.getContext('2d')!;
  if (s.fillColor) {
    octx.fillStyle = s.fillColor;
    octx.fillRect(0, 0, out.width, out.height);
  }
  octx.drawImage(base, (out.width - base.width) / 2, (out.height - base.height) / 2);
  drawWatermark(octx, out.width, out.height, s.watermark, logo);
  return out;
}

export function canvasToWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b && b.type === 'image/webp' ? resolve(b) : reject(new Error('مرورگر از خروجی WebP پشتیبانی نمی‌کند'))),
      'image/webp',
      quality,
    );
  });
}

/** Estimates the backdrop colour from the four corners (median per channel). */
export function sampleBackground(img: HTMLImageElement): [number, number, number] {
  const c = makeCanvas(img.naturalWidth, img.naturalHeight);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const pts = [
    [0, 0],
    [c.width - 1, 0],
    [0, c.height - 1],
    [c.width - 1, c.height - 1],
  ];
  const px = pts.map(([x, y]) => ctx.getImageData(x, y, 1, 1).data);
  const med = (k: number) => px.map((p) => p[k]).sort((a, b) => a - b)[1];
  return [med(0), med(1), med(2)];
}
