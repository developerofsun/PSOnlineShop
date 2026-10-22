import { CloseOutlined } from '@ant-design/icons';
import { App, Button, Checkbox, ColorPicker, Input, Modal, Progress, Radio, Slider, Space, Switch, Tabs, Typography } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import {
  canvasToWebp,
  defaultSettings,
  loadImage,
  renderEdited,
  sampleBackground,
  type EditSettings,
  type Watermark,
} from '../lib/imageEdit';
import type { Media } from '../lib/types';

export const MAX_BULK_IMAGES = 10;

type Item = { id: number; file: File; url: string; img: HTMLImageElement; bg: [number, number, number]; skip: boolean };

const GRID = [0.15, 0.5, 0.85];

/**
 * Edits up to MAX_BULK_IMAGES images with one shared set of settings (background cut, adjustments, watermark),
 * exports each as WebP and uploads it to the media library. Calls onDone with the uploaded URLs.
 */
export default function ImageEditorModal({
  files,
  onClose,
  onDone,
}: {
  files: File[] | null;
  onClose: () => void;
  onDone: (urls: string[]) => void;
}) {
  const { message } = App.useApp();
  const [items, setItems] = useState<Item[]>([]);
  const [current, setCurrent] = useState(0);
  const [s, setS] = useState<EditSettings>(defaultSettings);
  const [autoBg, setAutoBg] = useState(true);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Load the picked files (capped) whenever the modal opens.
  useEffect(() => {
    if (!files?.length) return;
    let cancelled = false;
    const picked = files.slice(0, MAX_BULK_IMAGES);
    if (files.length > MAX_BULK_IMAGES) message.warning(`حداکثر ${MAX_BULK_IMAGES} تصویر در هر نوبت؛ بقیه نادیده گرفته شد.`);
    void (async () => {
      const loaded: Item[] = [];
      for (const [i, file] of picked.entries()) {
        const url = URL.createObjectURL(file);
        try {
          const img = await loadImage(url);
          loaded.push({ id: i, file, url, img, bg: sampleBackground(img), skip: false });
        } catch {
          URL.revokeObjectURL(url);
          message.error(`${file.name} باز نشد`);
        }
      }
      if (cancelled) return loaded.forEach((l) => URL.revokeObjectURL(l.url));
      cutouts.current.clear();
      cutoutImgs.current.clear();
      setItems(loaded);
      setCurrent(0);
      setS(defaultSettings());
      setProgress(null);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  useEffect(() => () => items.forEach((i) => URL.revokeObjectURL(i.url)), [items]);

  useEffect(() => {
    if (s.watermark.kind !== 'image' || !s.watermark.imageUrl) return setLogo(null);
    loadImage(s.watermark.imageUrl).then(setLogo).catch(() => setLogo(null));
  }, [s.watermark.kind, s.watermark.imageUrl]);

  const useAi = s.removeBg && s.bgMode === 'ai';

  // AI cutouts are computed once per image (the model is large, so it is loaded lazily) and cached.
  const cutouts = useRef(new Map<number, Promise<HTMLImageElement>>());
  const [cutReady, setCutReady] = useState(0);
  const [aiBusy, setAiBusy] = useState(false);
  const cutoutImgs = useRef(new Map<number, HTMLImageElement>());

  function getCutout(it: Item): Promise<HTMLImageElement> {
    let p = cutouts.current.get(it.id);
    if (!p) {
      p = (async () => {
        const { removeBackground } = await import('@imgly/background-removal');
        const blob = await removeBackground(it.file, { output: { format: 'image/png' } });
        const url = URL.createObjectURL(blob);
        const img = await loadImage(url);
        cutoutImgs.current.set(it.id, img);
        return img;
      })();
      p.catch(() => cutouts.current.delete(it.id));
      cutouts.current.set(it.id, p);
    }
    return p;
  }

  useEffect(() => {
    if (!useAi || !items.length) return;
    let cancelled = false;
    setAiBusy(true);
    void (async () => {
      try {
        // Current image first so the preview updates quickly.
        const order = [items[current], ...items.filter((_, i) => i !== current)].filter(Boolean);
        for (const it of order) {
          if (cancelled) return;
          if (!it.skip) await getCutout(it);
          setCutReady((n) => n + 1);
        }
      } catch (e) {
        message.error(e instanceof Error ? `حذف هوشمند پس‌زمینه ناموفق بود: ${e.message}` : 'حذف هوشمند پس‌زمینه ناموفق بود');
        setS((p) => ({ ...p, bgMode: 'color' }));
      } finally {
        if (!cancelled) setAiBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useAi, items]);

  // With AI the source is already cut out, so the colour cutter must not run on top of it.
  const settingsFor = (it: Item): EditSettings => {
    const base = autoBg ? { ...s, bgColor: it.bg } : s;
    return useAi ? { ...base, removeBg: false } : base;
  };
  const sourceFor = (it: Item) => (useAi ? (cutoutImgs.current.get(it.id) ?? it.img) : it.img);

  // Live preview of the current image.
  const item = items[current];
  useEffect(() => {
    const host = canvasHost.current;
    if (!host || !item) return;
    const canvas = renderEdited(sourceFor(item), settingsFor(item), logo, 720);
    canvas.style.cssText = 'max-width:100%;max-height:100%;display:block;touch-action:none';
    host.replaceChildren(canvas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, s, logo, autoBg, cutReady]);

  function setWm(patch: Partial<Watermark>) {
    setS((p) => ({ ...p, watermark: { ...p.watermark, ...patch } }));
  }
  const set = (patch: Partial<EditSettings>) => setS((p) => ({ ...p, ...patch }));

  function moveWatermark(e: React.PointerEvent) {
    const canvas = canvasHost.current?.firstElementChild as HTMLCanvasElement | undefined;
    if (!canvas || !s.watermark.enabled || s.watermark.tile) return;
    const r = canvas.getBoundingClientRect();
    setWm({
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    });
  }

  function pickLogo(file: File) {
    const reader = new FileReader();
    reader.onload = () => setWm({ imageUrl: String(reader.result), kind: 'image' });
    reader.readAsDataURL(file);
  }

  const active = useMemo(() => items.filter((i) => !i.skip), [items]);

  async function exportAll() {
    if (!active.length) return message.warning('حداقل یک تصویر را انتخاب کنید');
    if (s.watermark.enabled && s.watermark.kind === 'text' && !s.watermark.text.trim()) return message.warning('متن واترمارک را وارد کنید');
    if (s.watermark.enabled && s.watermark.kind === 'image' && !logo) return message.warning('تصویر واترمارک را انتخاب کنید');
    setProgress(0);
    const urls: string[] = [];
    try {
      for (const [n, it] of active.entries()) {
        const src = useAi ? await getCutout(it) : it.img;
        const canvas = renderEdited(src, settingsFor(it), logo);
        const blob = await canvasToWebp(canvas, s.quality);
        const fd = new FormData();
        fd.append('file', new File([blob], it.file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' }));
        const m = await api.post<Media>('/api/admin/media', fd);
        urls.push(m.url);
        setProgress(Math.round(((n + 1) / active.length) * 100));
      }
      onDone(urls);
    } catch (e) {
      // Keep what already uploaded so work isn't lost, and let the user retry the rest.
      if (urls.length) onDone(urls);
      message.error(e instanceof Error ? e.message : 'آپلود ناموفق بود');
    } finally {
      setProgress(null);
    }
  }

  const wm = s.watermark;
  const busy = progress !== null;

  return (
    <Modal
      open={!!files?.length}
      onCancel={busy ? undefined : onClose}
      title={`ویرایش تصاویر (${active.length} از ${items.length})`}
      width={1100}
      destroyOnClose
      maskClosable={false}
      footer={
        <Space>
          <Button onClick={onClose} disabled={busy}>
            انصراف
          </Button>
          <Button type="primary" loading={busy} onClick={exportAll}>
            تبدیل به WebP و آپلود
          </Button>
        </Space>
      }
    >
      {busy && <Progress percent={progress ?? 0} style={{ marginBottom: 8 }} />}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 420px', minWidth: 0 }}>
          <div
            ref={canvasHost}
            onPointerDown={(e) => {
              dragging.current = true;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              moveWatermark(e);
            }}
            onPointerMove={(e) => dragging.current && moveWatermark(e)}
            onPointerUp={() => (dragging.current = false)}
            style={{
              height: 440,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 8,
              cursor: wm.enabled && !wm.tile ? 'move' : 'default',
              background: 'repeating-conic-gradient(#e5e5e5 0% 25%, #fff 0% 50%) 0 0 / 16px 16px',
            }}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {wm.enabled && !wm.tile ? 'برای جابه‌جایی واترمارک روی تصویر بکشید. ' : ''}تنظیمات روی همه تصاویر اعمال می‌شود.
          </Typography.Text>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, overflowX: 'auto' }}>
            {items.map((it, i) => (
              <div key={it.id} style={{ position: 'relative', flex: '0 0 auto' }}>
                <img
                  src={it.url}
                  alt=""
                  onClick={() => setCurrent(i)}
                  style={{
                    width: 64,
                    height: 64,
                    objectFit: 'cover',
                    borderRadius: 6,
                    cursor: 'pointer',
                    opacity: it.skip ? 0.3 : 1,
                    outline: i === current ? '2px solid #1d4ed8' : 'none',
                  }}
                />
                <Button
                  size="small"
                  type="text"
                  icon={<CloseOutlined />}
                  title={it.skip ? 'بازگرداندن' : 'حذف از این دسته'}
                  style={{ position: 'absolute', top: 0, insetInlineEnd: 0, background: '#fffc' }}
                  onClick={() => setItems((p) => p.map((x) => (x.id === it.id ? { ...x, skip: !x.skip } : x)))}
                />
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: '1 1 340px', minWidth: 0 }}>
          <Tabs
            size="small"
            items={[
              {
                key: 'bg',
                label: 'حذف پس‌زمینه',
                children: (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Switch checked={s.removeBg} onChange={(v) => set({ removeBg: v })} /> حذف پس‌زمینه
                    {s.removeBg && (
                      <>
                        <Radio.Group value={s.bgMode} onChange={(e) => set({ bgMode: e.target.value })}>
                          <Radio.Button value="color">رنگی (سریع)</Radio.Button>
                          <Radio.Button value="ai">هوشمند (AI)</Radio.Button>
                        </Radio.Group>
                        {s.bgMode === 'ai' && (
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {aiBusy ? 'در حال پردازش تصاویر…' : 'آماده'} — بار اول مدل (حدود چند ده مگابایت) دانلود می‌شود و پردازش روی همین دستگاه انجام می‌شود.
                          </Typography.Text>
                        )}
                        {s.bgMode === 'color' && (
                          <>
                        <Checkbox checked={autoBg} onChange={(e) => setAutoBg(e.target.checked)}>
                          تشخیص خودکار رنگ پس‌زمینه از گوشه‌ها
                        </Checkbox>
                        {!autoBg && (
                          <ColorPicker
                            value={`rgb(${s.bgColor.join(',')})`}
                            onChange={(c) => {
                              const { r, g, b } = c.toRgb();
                              set({ bgColor: [r, g, b] });
                            }}
                          />
                        )}
                        <div>حساسیت</div>
                        <Slider min={1} max={80} value={s.bgTolerance} onChange={(v) => set({ bgTolerance: v })} />
                        <div>نرمی لبه</div>
                        <Slider min={0} max={6} value={s.bgFeather} onChange={(v) => set({ bgFeather: v })} />
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          برای پس‌زمینه‌های ساده و یکرنگ مناسب است. برای پس‌زمینه‌های شلوغ حالت هوشمند را انتخاب کنید.
                        </Typography.Text>
                          </>
                        )}
                      </>
                    )}
                    <Checkbox checked={s.fillColor !== null} onChange={(e) => set({ fillColor: e.target.checked ? '#ffffff' : null })}>
                      پر کردن بخش شفاف با رنگ
                    </Checkbox>
                    {s.fillColor !== null && <ColorPicker value={s.fillColor} onChange={(c) => set({ fillColor: c.toHexString() })} />}
                  </Space>
                ),
              },
              {
                key: 'adjust',
                label: 'ویرایش',
                children: (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Space wrap>
                      <Button onClick={() => set({ rotate: (((s.rotate + 90) % 360) as EditSettings['rotate']) })}>چرخش ۹۰°</Button>
                      <Button type={s.flipH ? 'primary' : 'default'} onClick={() => set({ flipH: !s.flipH })}>
                        آینه
                      </Button>
                      <Checkbox checked={s.square} onChange={(e) => set({ square: e.target.checked })}>
                        خروجی مربع
                      </Checkbox>
                    </Space>
                    <div>روشنایی</div>
                    <Slider min={50} max={150} value={s.brightness} onChange={(v) => set({ brightness: v })} />
                    <div>کنتراست</div>
                    <Slider min={50} max={150} value={s.contrast} onChange={(v) => set({ contrast: v })} />
                    <div>اشباع رنگ</div>
                    <Slider min={0} max={200} value={s.saturation} onChange={(v) => set({ saturation: v })} />
                    <div>بیشینه ابعاد (پیکسل)</div>
                    <Radio.Group value={s.maxSide} onChange={(e) => set({ maxSide: e.target.value })}>
                      {[1000, 1600, 2400].map((v) => (
                        <Radio.Button key={v} value={v}>
                          {v}
                        </Radio.Button>
                      ))}
                    </Radio.Group>
                    <div>کیفیت WebP</div>
                    <Slider min={50} max={100} value={Math.round(s.quality * 100)} onChange={(v) => set({ quality: v / 100 })} />
                  </Space>
                ),
              },
              {
                key: 'wm',
                label: 'واترمارک',
                children: (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Switch checked={wm.enabled} onChange={(v) => setWm({ enabled: v })} /> افزودن واترمارک
                    {wm.enabled && (
                      <>
                        <Radio.Group value={wm.kind} onChange={(e) => setWm({ kind: e.target.value })}>
                          <Radio.Button value="text">متن</Radio.Button>
                          <Radio.Button value="image">لوگو</Radio.Button>
                        </Radio.Group>
                        {wm.kind === 'text' ? (
                          <Input value={wm.text} placeholder="مثلاً نام فروشگاه" onChange={(e) => setWm({ text: e.target.value })} />
                        ) : (
                          <input type="file" accept="image/png,image/webp,image/jpeg" onChange={(e) => e.target.files?.[0] && pickLogo(e.target.files[0])} />
                        )}
                        <div>موقعیت (یا روی تصویر بکشید)</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 32px)', gap: 4 }}>
                          {GRID.flatMap((y) =>
                            GRID.map((x) => (
                              <Button
                                key={`${x}-${y}`}
                                size="small"
                                type={!wm.tile && wm.x === x && wm.y === y ? 'primary' : 'default'}
                                onClick={() => setWm({ x, y, tile: false })}
                              />
                            )),
                          )}
                        </div>
                        <Checkbox checked={wm.tile} onChange={(e) => setWm({ tile: e.target.checked })}>
                          تکرار روی کل تصویر
                        </Checkbox>
                        <div>اندازه</div>
                        <Slider min={5} max={100} value={Math.round(wm.size * 100)} onChange={(v) => setWm({ size: v / 100 })} />
                        <div>شفافیت</div>
                        <Slider min={5} max={100} value={Math.round(wm.opacity * 100)} onChange={(v) => setWm({ opacity: v / 100 })} />
                        <div>زاویه ({wm.rotation}°)</div>
                        <Slider min={-180} max={180} value={wm.rotation} onChange={(v) => setWm({ rotation: v })} />
                      </>
                    )}
                  </Space>
                ),
              },
            ]}
          />
        </div>
      </div>
    </Modal>
  );
}
