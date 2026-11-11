import {
  AppstoreOutlined,
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  CopyOutlined,
  CustomerServiceOutlined,
  DeleteOutlined,
  FontSizeOutlined,
  GlobalOutlined,
  LinkOutlined,
  MailOutlined,
  PictureOutlined,
  PlusOutlined,
  SaveOutlined,
  SendOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  ColorPicker,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Spin,
  Switch,
  Tabs,
  Tag,
  Tooltip,
} from 'antd';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import ImageUpload from '../components/ImageUpload';
import LangTabs from '../components/LangTabs';
import type { L10n } from '../lib/types';
import {
  CONTACT_ICONS,
  FooterIcon,
  SOCIAL_LABELS,
  SOCIAL_NETWORKS,
} from '../components/FooterIcons';
import { api } from '../lib/api';
import type {
  FooterAlign,
  FooterColumn,
  FooterContactItem,
  FooterElement,
  FooterElementType,
  FooterLayout,
  FooterLinkItem,
  FooterSize,
  FooterSocial,
} from '../lib/types';

type Language = { code: string; label: string };

const ELEMENT_TYPES: { type: FooterElementType; label: string; icon: ReactNode; hint: string }[] = [
  { type: 'heading', label: 'تیتر', icon: <FontSizeOutlined />, hint: 'عنوان کوچک ستون' },
  { type: 'text', label: 'متن', icon: <AppstoreOutlined />, hint: 'متن آزاد (چندخطی)' },
  { type: 'links', label: 'فهرست لینک', icon: <LinkOutlined />, hint: 'چند لینک زیر هم' },
  { type: 'contact', label: 'اطلاعات تماس', icon: <CustomerServiceOutlined />, hint: 'تلفن، ایمیل، نشانی، ساعت کاری' },
  { type: 'logo', label: 'لوگو / نام سایت', icon: <SendOutlined />, hint: 'لوگوی تنظیمات یا نام سایت' },
  { type: 'newsletter', label: 'عضویت در خبرنامه', icon: <MailOutlined />, hint: 'کادر ایمیل خبرنامه' },
  { type: 'socials', label: 'شبکه‌های اجتماعی', icon: <GlobalOutlined />, hint: 'آیکون شبکه‌های فعال سایت' },
  { type: 'image', label: 'تصویر / نشان', icon: <PictureOutlined />, hint: 'مثلاً نماد اعتماد' },
];

/** Storefront routes that are not pages (the API's footer links accept site-relative paths). */
const BUILT_IN_LINKS = [
  { value: '/products', label: 'همه محصولات — /products' },
  { value: '/products?onSale=true', label: 'تخفیف‌ها — /products?onSale=true' },
  { value: '/compare', label: 'مقایسه — /compare' },
  { value: '/favorites', label: 'علاقه‌مندی‌ها — /favorites' },
  { value: '/cart', label: 'سبد خرید — /cart' },
  { value: '/account', label: 'حساب کاربری — /account' },
];

const emptyConfig = (type: FooterElementType): FooterElement['config'] => {
  switch (type) {
    case 'links':
      return { items: [{ text: {}, link: '' }] };
    case 'contact':
      return { items: [{ icon: 'phone', text: {}, link: '' }] };
    case 'logo':
      return { logo: true, textOn: true };
    case 'image':
      return { imageUrl: '' };
    case 'heading':
    case 'text':
      return { text: {} };
    default:
      return {};
  }
};

const newElement = (type: FooterElementType): FooterElement => ({ type, config: emptyConfig(type) });

/** The editor model mirrors the API DTO but keeps only what each element type needs. */
function toModel(d: {
  id: number;
  isActive: boolean;
  theme: string;
  headingColor: string | null;
  linkColor: string | null;
  background: L10n;
  textColor: L10n;
  mutedColor: L10n;
  copyright: L10n;
  pageSlug: L10n;
  columns: { width: number; elements: { type: FooterElementType; config: Record<string, unknown> }[] }[];
  socials: FooterSocial[];
}): FooterLayout {
  return {
    id: d.id,
    isActive: d.isActive,
    theme: d.theme === 'custom' ? 'custom' : 'dark',
    headingColor: d.headingColor,
    linkColor: d.linkColor,
    background: d.background ?? {},
    textColor: d.textColor ?? {},
    mutedColor: d.mutedColor ?? {},
    copyright: d.copyright ?? {},
    pageSlug: d.pageSlug ?? {},
    columns: d.columns.map((c) => ({
      width: c.width,
      elements: c.elements.map((e) => {
        const cfg = e.config as Record<string, unknown>;
        // Elements saved before size presets existed have none; md keeps their original look.
        const size = (cfg.size as FooterSize | undefined) ?? 'md';
        const align = (cfg.align as FooterAlign | undefined) ?? null;
        switch (e.type) {
          case 'heading':
          case 'text':
            return { type: e.type, config: { text: (cfg.text as L10n) ?? {}, size } };
          case 'links':
            return { type: e.type, config: { items: (cfg.items as FooterLinkItem[]) ?? [], size } };
          case 'contact':
            return { type: e.type, config: { items: (cfg.items as FooterContactItem[]) ?? [], size } };
          case 'logo':
            return { type: e.type, config: { logo: !!cfg.logo, textOn: !!cfg.text, size, align } };
          case 'image':
            return { type: e.type, config: { imageUrl: (cfg.imageUrl as string) ?? '', size, align } };
          default:
            return { type: e.type, config: { size } };
        }
      }),
    })),
    socials: d.socials ?? [],
  };
}

function toBody(m: FooterLayout) {
  return {
    isActive: m.isActive,
    theme: m.theme,
    headingColor: m.headingColor,
    linkColor: m.linkColor,
    background: m.background,
    textColor: m.textColor,
    mutedColor: m.mutedColor,
    copyright: m.copyright,
    pageSlug: m.pageSlug,
    columns: m.columns.map((c) => ({
      width: c.width,
      elements: c.elements.map((e) => {
        const size = e.config.size ?? 'md';
        switch (e.type) {
          case 'heading':
          case 'text':
            return { type: e.type, config: { text: e.config.text ?? {}, size } };
          case 'links':
          case 'contact':
            return { type: e.type, config: { items: e.config.items ?? [], size } };
          case 'logo':
            return { type: e.type, config: { logo: !!e.config.logo, text: !!e.config.textOn, size, align: e.config.align ?? null } };
          case 'image':
            return { type: e.type, config: { imageUrl: e.config.imageUrl ?? '', size, align: e.config.align ?? null } };
          default:
            return { type: e.type, config: { size } };
        }
      }),
    })),
    socials: m.socials,
  };
}

/** Widths are stored as a share of the row; one column saved at 1.0 would be clamped by other columns, so divide by the total. */
function normalizeWidths(columns: FooterColumn[]): FooterColumn[] {
  const total = columns.reduce((s, c) => s + c.width, 0) || 1;
  return columns.map((c) => ({ ...c, width: Math.round((c.width / total) * 1000) / 1000 }));
}

function summarize(e: FooterElement, lang: string): string {
  const pick = (m?: L10n) => (m && (m[lang] || m.fa || Object.values(m)[0])) || '';
  switch (e.type) {
    case 'heading':
    case 'text':
      return pick(e.config.text) || '(خالی)';
    case 'links':
      return `${(e.config.items as FooterLinkItem[] | undefined)?.length ?? 0} لینک`;
    case 'contact':
      return `${(e.config.items as FooterContactItem[] | undefined)?.length ?? 0} مورد`;
    case 'logo':
      return [e.config.logo && 'لوگو', e.config.textOn && 'نام سایت'].filter(Boolean).join(' + ') || '(خالی)';
    case 'image':
      return e.config.imageUrl ? 'تصویر انتخاب شده' : '(بدون تصویر)';
    case 'socials':
      return 'آیکون‌های سایت';
    case 'newsletter':
      return 'کادر ایمیل';
    default:
      return '';
  }
}

const toHex = (v: string | null | undefined) => (v && /^#[0-9a-fA-F]{6}$/.test(v) ? v : undefined);

export default function FooterDesignerPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [model, setModel] = useState<FooterLayout | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lang, setLang] = useState('fa');
  const [selected, setSelected] = useState<{ col: number; el: number } | null>(null);
  const isFirst = useRef(true);

  // Storefront pages plus the built-in routes, offered as link targets in the element settings.
  const { data: pageRows = [], isLoading: pagesLoading } = useQuery({
    queryKey: ['pages', 'footer-links'],
    queryFn: () => api.get<{ id: number; title: string | null; slug: string | null }[]>('/api/admin/pages'),
  });
  const pageChoices = useMemo(
    () => [
      ...BUILT_IN_LINKS,
      ...pageRows
        .filter((p) => p.slug)
        .map((p) => ({ value: `/p/${p.slug}`, label: `${p.title ?? p.slug} — /p/${p.slug}` })),
    ],
    [pageRows],
  );

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['footer-layout'],
    queryFn: () => api.get<Parameters<typeof toModel>[0]>('/api/admin/footer'),
    retry: false,
  });

  useEffect(() => {
    if (!data) return;
    setModel(toModel(data));
    setDirty(false);
    if (isFirst.current) {
      isFirst.current = false;
      setSelected({ col: 0, el: 0 });
    }
  }, [data]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const update = (fn: (m: FooterLayout) => void) => {
    setModel((prev) => {
      if (!prev) return prev;
      const next: FooterLayout = structuredClone(prev);
      fn(next);
      return next;
    });
    setDirty(true);
  };

  const updateColumn = (col: number, fn: (c: FooterColumn) => void) =>
    update((m) => {
      if (m.columns[col]) fn(m.columns[col]);
    });

  const updateElement = (col: number, el: number, fn: (e: FooterElement) => void) =>
    updateColumn(col, (c) => {
      const e = c.elements[el];
      if (e) fn(e);
    });

  async function save() {
    if (!model) return;
    setSaving(true);
    try {
      const normalized = normalizeWidths(model.columns);
      await api.put('/api/admin/footer', toBody({ ...model, columns: normalized }));
      message.success('پاورقی ذخیره شد و بلافاصله در فروشگاه نمایش داده می‌شود');
      setDirty(false);
      void refetch();
      void qc.invalidateQueries({ queryKey: ['footer-layout'] });
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    setSaving(true);
    try {
      await api.post('/api/admin/footer/reset');
      message.success('پاورقی به حالت پیش‌فرض بازگشت');
      setDirty(false);
      void refetch();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'خطا');
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) return <Spin />;

  if (!model) {
    return (
      <Alert
        type="info"
        showIcon
        message="هنوز پاورقی طراحی نشده است"
        description="سایت فعلاً پاورقی کلاسیک را نشان می‌دهد. با «بازگردانی پیش‌فرض» یک نسخه‌ی قابل ویرایش از همان پاورقی ساخته می‌شود."
        action={
          <Button type="primary" onClick={() => void reset()} loading={saving}>
            ساخت پاورقی پیش‌فرض
          </Button>
        }
      />
    );
  }

  const active = selected && model.columns[selected.col]?.elements[selected.el] ? selected : null;
  const activeElement = active ? model.columns[active.col].elements[active.el] : null;

  return (
    <div className="footer-designer">
      <div className="page-title">
        <h1>طراحی پاورقی</h1>
        <Space wrap>
          {dirty && <Tag color="orange">تغییرات ذخیره نشده</Tag>}
          <Tooltip title="نمایش یک نسخه‌ی تازه از آخرین ذخیره‌شده">
            <Button
              icon={<UndoOutlined />}
              disabled={!data}
              onClick={() => {
                if (data) setModel(toModel(data));
                setDirty(false);
              }}
            >
              لغو تغییرات
            </Button>
          </Tooltip>
          <Popconfirm
            title="پاورقی با پیش‌فرض جایگزین شود؟"
            description="طرح فعلی (پس از ذخیره) از بین می‌رود."
            okText="جایگزین کن"
            cancelText="انصراف"
            onConfirm={() => void reset()}
          >
            <Button>بازگردانی پیش‌فرض</Button>
          </Popconfirm>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void save()}>
            ذخیره و انتشار
          </Button>
        </Space>
      </div>

      <div className="fd-grid">
        {/* ---------- left: add elements, columns ---------- */}
        <Card size="small" title="افزودن المان" className="fd-panel">
          <p className="fd-hint">
            یک ستون را از پیش‌نمایش انتخاب کنید، سپس المان مورد نظر را اضافه کنید. المان‌ها به ترتیب اضافه شدن، زیر هم قرار می‌گیرند.
          </p>
          <div className="fd-palette">
            {ELEMENT_TYPES.map((t) => (
              <Tooltip title={t.hint} key={t.type}>
                <Button
                  className="fd-palette-btn"
                  disabled={!selected}
                  onClick={() => {
                    if (!selected || !model) return;
                    const col = selected.col;
                    updateColumn(col, (c) => c.elements.push(newElement(t.type)));
                    setSelected({ col, el: (model.columns[col]?.elements.length ?? 0) });
                  }}
                >
                  {t.icon}
                  <span>{t.label}</span>
                </Button>
              </Tooltip>
            ))}
          </div>

          <Button
            block
            type="dashed"
            icon={<PlusOutlined />}
            style={{ marginTop: 12 }}
            disabled={model.columns.length >= 6}
            onClick={() => {
              const width = model.columns.length ? model.columns[0].width * 0.75 : 0.3;
              update((m) => m.columns.push({ width: Math.max(0.1, Math.min(1, width)), elements: [] }));
            }}
          >
            افزودن ستون
          </Button>
        </Card>

        <Card
          size="small"
          className="fd-panel"
          title={
            <Space>
              <span>ستون‌ها</span>
              <Segmented
                size="small"
                value={lang}
                onChange={(v) => setLang(String(v))}
                options={[{ value: 'fa', label: 'فارسی' }, { value: 'en', label: 'English' }]}
              />
            </Space>
          }
        >
          {model.columns.map((col, ci) => (
            <div key={ci} className={`fd-col ${active?.col === ci ? 'is-current' : ''}`}>
              <div className="fd-col-head">
                <span className="fd-col-title">ستون {ci + 1}</span>
                <Space size={2}>
                  <Button
                    size="small"
                    type="text"
                    icon={<ArrowRightOutlined />}
                    disabled={ci === 0}
                    onClick={() =>
                      update((m) => {
                        [m.columns[ci - 1], m.columns[ci]] = [m.columns[ci], m.columns[ci - 1]];
                      })
                    }
                  />
                  <Button
                    size="small"
                    type="text"
                    icon={<ArrowLeftOutlined />}
                    disabled={ci === model.columns.length - 1}
                    onClick={() =>
                      update((m) => {
                        [m.columns[ci + 1], m.columns[ci]] = [m.columns[ci], m.columns[ci + 1]];
                      })
                    }
                  />
                  <Popconfirm
                    title="این ستون با همه‌ی المان‌هایش حذف شود؟"
                    okText="حذف"
                    cancelText="انصراف"
                    disabled={model.columns.length === 1}
                    onConfirm={() => {
                      update((m) => m.columns.splice(ci, 1));
                      setSelected(null);
                    }}
                  >
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} disabled={model.columns.length === 1} />
                  </Popconfirm>
                </Space>
              </div>

              {col.elements.length === 0 && <p className="fd-hint">این ستون خالی است — از «افزودن المان» شروع کنید.</p>}

              {col.elements.map((el, ei) => (
                <div
                  key={ei}
                  className={`fd-el ${active?.col === ci && active?.el === ei ? 'is-current' : ''}`}
                  onClick={() => setSelected({ col: ci, el: ei })}
                >
                  <span className="fd-el-label">
                    {ELEMENT_TYPES.find((t) => t.type === el.type)?.label}
                    <small>{summarize(el, lang)}</small>
                  </span>
                  <Space size={0} onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="small"
                      type="text"
                      icon={<ArrowUpOutlined />}
                      disabled={ei === 0}
                      onClick={() => updateColumn(ci, (c) => ([c.elements[ei - 1], c.elements[ei]] = [c.elements[ei], c.elements[ei - 1]]))}
                    />
                    <Button
                      size="small"
                      type="text"
                      icon={<ArrowDownOutlined />}
                      disabled={ei === col.elements.length - 1}
                      onClick={() => updateColumn(ci, (c) => ([c.elements[ei + 1], c.elements[ei]] = [c.elements[ei], c.elements[ei + 1]]))}
                    />
                    <Tooltip title="کپی">
                      <Button
                        size="small"
                        type="text"
                        icon={<CopyOutlined />}
                        onClick={() => {
                          updateColumn(ci, (c) => c.elements.splice(ei + 1, 0, structuredClone(el)));
                          setSelected({ col: ci, el: ei + 1 });
                        }}
                      />
                    </Tooltip>
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => updateColumn(ci, (c) => void c.elements.splice(ei, 1))}
                    />
                  </Space>
                </div>
              ))}
            </div>
          ))}
        </Card>

        {/* ---------- right: inspector ---------- */}
        <Card size="small" title="تنظیمات" className="fd-panel fd-inspector">
          <Tabs
            size="small"
            items={[
              {
                key: 'element',
                label: 'المان انتخاب‌شده',
                children: activeElement && active ? (
                  <ElementEditor
                    element={activeElement}
                    onChange={(fn) => updateElement(active.col, active.el, fn)}
                    pageChoices={pageChoices}
                    pagesLoading={pagesLoading}
                  />
                ) : (
                  <p className="fd-hint">از پیش‌نمایش یا فهرست ستون‌ها یک المان را انتخاب کنید.</p>
                ),
              },
              {
                key: 'style',
                label: 'ظاهر پاورقی',
                children: <AppearanceEditor model={model} update={update} onResetDefaults={() => void reset()} />,
              },
              {
                key: 'socials',
                label: 'شبکه‌های اجتماعی',
                children: <SocialsEditor model={model} update={update} />,
              },
            ]}
          />
        </Card>
      </div>

      <Card size="small" title="پیش‌نمایش زنده" className="fd-preview-card" style={{ marginTop: 16 }}>
        <FooterPreview model={model} lang={lang} onSelect={(c, e) => setSelected({ col: c, el: e })} selected={active} />
      </Card>
    </div>
  );
}

// --------------------------------------------------------------------------- element settings

const SIZE_OPTIONS: { value: FooterSize; label: string }[] = [
  { value: 'sm', label: 'کوچک' },
  { value: 'md', label: 'متوسط' },
  { value: 'lg', label: 'بزرگ' },
  { value: 'xl', label: 'خیلی بزرگ' },
];

/** Size (every element) and horizontal alignment (only the visual elements, logo and image). */
function SizeControls({ element, set }: { element: FooterElement; set: (fn: (e: FooterElement) => void) => void }) {
  const sizeHint: Record<FooterElementType, string> = {
    heading: 'اندازه عنوان ستون',
    text: 'اندازه متن',
    links: 'اندازه لینک‌ها',
    contact: 'اندازه متن و آیکون‌ها',
    logo: 'اندازه لوگو و نام سایت',
    newsletter: 'اندازه کادر و دکمه',
    socials: 'اندازه آیکون‌ها',
    image: 'اندازه تصویر',
  };
  return (
    <>
      <Form.Item label={`اندازه (${sizeHint[element.type]})`}>
        <Segmented
          size="small"
          value={element.config.size ?? 'md'}
          onChange={(v) =>
            set((el) => {
              el.config.size = v as FooterSize;
            })
          }
          options={SIZE_OPTIONS}
        />
      </Form.Item>
      {(element.type === 'logo' || element.type === 'image') && (
        <Form.Item label="چیدمان در ستون">
          <Segmented
            size="small"
            value={element.config.align ?? 'start'}
            onChange={(v) =>
              set((el) => {
                el.config.align = v as FooterAlign;
              })
            }
            options={[
              { value: 'start', label: 'ابتدای ستون' },
              { value: 'center', label: 'وسط' },
              { value: 'end', label: 'انتهای ستون' },
            ]}
          />
        </Form.Item>
      )}
    </>
  );
}

function ElementEditor({
  element,
  onChange,
  pageChoices,
  pagesLoading,
}: {
  element: FooterElement;
  onChange: (fn: (e: FooterElement) => void) => void;
  pageChoices: { value: string; label: string }[];
  pagesLoading: boolean;
}) {
  const set = (fn: (e: FooterElement) => void) => onChange(fn);
  const size = <SizeControls element={element} set={set} />;

  if (element.type === 'heading' || element.type === 'text') {
    return (
      <>
        {size}
        <LangTabs>
        {(code, dir) => (
          <Form.Item label={element.type === 'heading' ? 'عنوان' : 'متن'}>
            <Input.TextArea
              rows={element.type === 'heading' ? 1 : 4}
              dir={dir}
              value={element.config.text?.[code] ?? ''}
              onChange={(e) =>
                set((el) => {
                  el.config.text = { ...el.config.text, [code]: e.target.value };
                })
              }
            />
          </Form.Item>
        )}
        </LangTabs>
      </>
    );
  }

  if (element.type === 'links' || element.type === 'contact') {
    const items = (element.config.items ?? []) as (FooterLinkItem | FooterContactItem)[];
    const isContact = element.type === 'contact';
    return (
      <>
      {size}
      <div>
        {items.map((item, i) => (
          <Card key={i} size="small" style={{ marginBottom: 8 }} styles={{ body: { padding: 10 } }}>
            <Space align="start" style={{ width: '100%' }} direction="vertical" size={6}>
              {isContact && (
                <Select
                  size="small"
                  style={{ width: '100%' }}
                  value={(item as FooterContactItem).icon}
                  onChange={(v) =>
                    set((el) => {
                      (el.config.items as FooterContactItem[])[i].icon = v;
                    })
                  }
                  options={CONTACT_ICONS.map((c) => ({
                    value: c,
                    label: (
                      <Space>
                        <FooterIcon name={c} />
                        {{ phone: 'تلفن', mail: 'ایمیل', pin: 'نشانی', clock: 'ساعت کار' }[c]}
                      </Space>
                    ),
                  }))}
                />
              )}
              <LangTabs>
                {(code, dir) => (
                  <Input
                    dir={dir}
                    placeholder={isContact ? '۰۲۱-...' : 'متن لینک'}
                    value={item.text?.[code] ?? ''}
                    onChange={(e) =>
                      set((el) => {
                        (el.config.items as FooterLinkItem[])[i].text = { ...item.text, [code]: e.target.value };
                      })
                    }
                  />
                )}
              </LangTabs>
              {isContact ? (
                <Input
                  dir="ltr"
                  placeholder="tel:021... یا mailto:... (اختیاری)"
                  value={item.link ?? ''}
                  onChange={(e) =>
                    set((el) => {
                      (el.config.items as FooterLinkItem[])[i].link = e.target.value;
                    })
                  }
                />
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder="انتخاب صفحه فروشگاه…"
                    value={pageChoices.some((p) => p.value === item.link) ? (item.link ?? undefined) : undefined}
                    options={pageChoices}
                    loading={pagesLoading}
                    onChange={(href?: string) =>
                      set((el) => {
                        (el.config.items as FooterLinkItem[])[i].link = href ?? '';
                      })
                    }
                  />
                  <Input
                    dir="ltr"
                    placeholder="یا آدرس دلخواه: /products یا https://..."
                    value={item.link ?? ''}
                    onChange={(e) =>
                      set((el) => {
                        (el.config.items as FooterLinkItem[])[i].link = e.target.value;
                      })
                    }
                  />
                </div>
              )}
              <Button
                size="small"
                danger
                type="text"
                icon={<DeleteOutlined />}
                onClick={() =>
                  set((el) => {
                    (el.config.items as FooterLinkItem[]).splice(i, 1);
                  })
                }
              />
            </Space>
          </Card>
        ))}
        <Button
          block
          size="small"
          type="dashed"
          icon={<PlusOutlined />}
          onClick={() =>
            set((el) => {
              const list = el.config.items as (FooterLinkItem | FooterContactItem)[];
              list.push(isContact ? { icon: 'phone', text: {}, link: '' } : { text: {}, link: '' });
            })
          }
        >
          افزودن {isContact ? 'مورد' : 'لینک'}
        </Button>
      </div>
      </>
    );
  }

  if (element.type === 'logo') {
    return (
      <>
      {size}
      <Space direction="vertical">
        <Space>
          <Switch
            checked={!!element.config.logo}
            onChange={(v) =>
              set((el) => {
                el.config.logo = v;
              })
            }
          />
          <span>نمایش لوگو (از تنظیمات → اطلاعات سایت)</span>
        </Space>
        <Space>
          <Switch
            checked={!!element.config.textOn}
            onChange={(v) =>
              set((el) => {
                el.config.textOn = v;
              })
            }
          />
          <span>نمایش نام سایت زیر لوگو</span>
        </Space>
      </Space>
      </>
    );
  }

  if (element.type === 'image') {
    return (
      <>
      {size}
      <Form.Item label="تصویر">
        <ImageUpload
          value={element.config.imageUrl}
          onChange={(url) =>
            set((el) => {
              el.config.imageUrl = url;
            })
          }
        />
      </Form.Item>
      </>
    );
  }

  if (element.type === 'socials') {
    return (
      <>
        {size}
        <p className="fd-hint">آیکون همه‌ی شبکه‌های اجتماعی که در تب «شبکه‌های اجتماعی» اضافه کرده‌اید اینجا نمایش داده می‌شود.</p>
      </>
    );
  }

  // newsletter
  return (
    <>
      {size}
      <p className="fd-hint">
        وقتی بازدیدکننده ایمیلش را وارد می‌کند، فرم ایمیل خودش باز می‌شود تا درخواست را بفرستد. در پیش‌نمایش فقط شکل کادر دیده می‌شود.
      </p>
    </>
  );
}

// --------------------------------------------------------------------------- appearance

function AppearanceEditor({
  model,
  update,
  onResetDefaults,
}: {
  model: FooterLayout;
  update: (fn: (m: FooterLayout) => void) => void;
  onResetDefaults: () => void;
}) {
  // Only real pages are offered: the API rejects a slug that does not exist.
  const { data: pages = [], isLoading: pagesLoading } = useQuery({
    queryKey: ['pages', 'footer-links'],
    queryFn: () => api.get<{ id: number; title: string | null; slug: string | null }[]>('/api/admin/pages'),
  });

  const colorField = (label: string, key: 'background' | 'textColor' | 'mutedColor', fallback: string) => (
    <LangTabs>
      {(code, dir) => (
        <Form.Item label={label}>
          <ColorPicker
            showText
            format="hex"
            value={toHex(model[key][code]) ?? fallback}
            onChangeComplete={(c) =>
              update((m) => {
                m[key] = { ...m[key], [code]: c.toHexString() };
              })
            }
          />
          <span dir={dir} />
        </Form.Item>
      )}
    </LangTabs>
  );

  return (
    <>
      <Form.Item label="فعال بودن پاورقی طراحی‌شده" tooltip="اگر خاموش شود، فروشگاه پاورقی کلاسیک را نشان می‌دهد.">
        <Switch
          checked={model.isActive}
          onChange={(v) =>
            update((m) => {
              m.isActive = v;
            })
          }
        />
      </Form.Item>

      <Form.Item label="رنگ متن و آیکون‌ها">
        <Segmented
          value={model.theme}
          onChange={(v) =>
            update((m) => {
              m.theme = v === 'custom' ? 'custom' : 'dark';
            })
          }
          options={[
            { value: 'dark', label: 'خودکار (خوانا روی پس‌زمینه)' },
            { value: 'custom', label: 'سفارشی' },
          ]}
        />
      </Form.Item>

      {colorField('رنگ پس‌زمینه', 'background', '#1f1e1a')}
      {colorField('رنگ متن اصلی', 'textColor', '#f1efea')}
      {colorField('رنگ متن کم‌رنگ (برای لوگو و توضیحات)', 'mutedColor', '#a29d92')}

      {model.theme === 'custom' && (
        <>
          <Form.Item label="رنگ تیترها">
            <ColorPicker
              showText
              format="hex"
              allowClear
              value={toHex(model.headingColor)}
              onChangeComplete={(c) =>
                update((m) => {
                  m.headingColor = c.toHexString();
                })
              }
            />
          </Form.Item>
          <Form.Item label="رنگ لینک‌ها">
            <ColorPicker
              showText
              format="hex"
              allowClear
              value={toHex(model.linkColor)}
              onChangeComplete={(c) =>
                update((m) => {
                  m.linkColor = c.toHexString();
                })
              }
            />
          </Form.Item>
        </>
      )}

      <LangTabs>
        {(code, dir) => (
          <Form.Item label="متن کپی‌رایت (پیش از سال و نام سایت)">
            <Input
              dir={dir}
              placeholder="همه حقوق محفوظ است."
              value={model.copyright[code] ?? ''}
              onChange={(e) =>
                update((m) => {
                  m.copyright = { ...m.copyright, [code]: e.target.value };
                })
              }
            />
          </Form.Item>
        )}
      </LangTabs>

      <LangTabs>
        {(code) => (
          <Form.Item label="صفحه‌ای که کپی‌رایت به آن لینک شود" tooltip="مثلاً قوانین و مقررات. خالی = بدون لینک.">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="بدون لینک"
              value={model.pageSlug[code] || undefined}
              loading={pagesLoading}
              onChange={(slug?: string) =>
                update((m) => {
                  const next = { ...m.pageSlug };
                  if (slug) next[code] = slug;
                  else delete next[code];
                  m.pageSlug = next;
                })
              }
              options={pages.map((p) => ({ value: p.slug, label: p.title ? `${p.title} (${p.slug})` : p.slug }))}
            />
          </Form.Item>
        )}
      </LangTabs>

      <Popconfirm title="پاورقی با پیش‌فرض جایگزین شود؟" okText="بله" cancelText="انصراف" onConfirm={onResetDefaults}>
        <Button size="small">بازگردانی به پیش‌فرض</Button>
      </Popconfirm>
    </>
  );
}

// --------------------------------------------------------------------------- socials

function SocialsEditor({ model, update }: { model: FooterLayout; update: (fn: (m: FooterLayout) => void) => void }) {
  return (
    <div>
      <p className="fd-hint">هر شبکه فقط یک بار. آدرس باید با https:// شروع شود (تلگرام: https://t.me/نام‌کاربری).</p>
      {model.socials.map((s, i) => (
        <Space key={i} style={{ width: '100%', marginBottom: 6 }}>
          <Select
            style={{ width: 150 }}
            value={s.network}
            onChange={(v) =>
              update((m) => {
                m.socials[i].network = v;
              })
            }
            options={SOCIAL_NETWORKS.map((n) => ({ value: n, label: SOCIAL_LABELS[n] }))}
          />
          <Input
            dir="ltr"
            style={{ width: 220 }}
            placeholder="https://"
            value={s.url}
            onChange={(e) =>
              update((m) => {
                m.socials[i].url = e.target.value;
              })
            }
          />
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() =>
              update((m) => {
                m.socials.splice(i, 1);
              })
            }
          />
        </Space>
      ))}
      <Button
        size="small"
        type="dashed"
        icon={<PlusOutlined />}
        disabled={model.socials.length >= SOCIAL_NETWORKS.length}
        onClick={() =>
          update((m) => {
            const used = new Set(m.socials.map((s) => s.network));
            const next = SOCIAL_NETWORKS.find((n) => !used.has(n));
            if (next) m.socials.push({ network: next, url: '' });
          })
        }
      >
        افزودن شبکه
      </Button>
    </div>
  );
}

// --------------------------------------------------------------------------- live preview

/** Mirrors the storefront's size scale (storefront/src/components/DesignedFooter.tsx): value per preset. */
const SCALE: Record<FooterSize, number> = { sm: 0.85, md: 1, lg: 1.25, xl: 1.5 };
/** CSS row height for scale(1), at the default md size. */
const BASE = { heading: 14, text: 13, link: 13, contactIcon: 14, logoH: 44, logoW: 110, logoText: 20, social: 32, socialIcon: 16, imageH: 64 };
const px = (base: number, size?: FooterSize) => Math.round(base * SCALE[size ?? 'md']);

const al = (align: FooterAlign | null | undefined) => (align === 'center' ? 'center' : align === 'end' ? 'flex-end' : 'flex-start');

function pick(map: L10n, lang: string) {
  return map[lang] || map.fa || Object.values(map)[0] || '';
}

function FooterPreview({
  model,
  lang,
  selected,
  onSelect,
}: {
  model: FooterLayout;
  lang: string;
  selected: { col: number; el: number } | null;
  onSelect: (col: number, el: number) => void;
}) {
  // Loop protection for the newsletter mock input
  const noop = useMemo(() => (e: React.FormEvent) => e.preventDefault(), []);

  const bg = pick(model.background, lang) || '#1f1e1a';
  const fg = pick(model.textColor, lang) || '#f1efea';
  const muted = pick(model.mutedColor, lang) || '#a29d92';
  const heading = model.theme === 'custom' ? model.headingColor ?? fg : '#ffffff';
  const link = model.theme === 'custom' ? model.linkColor ?? fg : fg;
  const rows = model.columns
    .map((c) => Math.max(1, Math.round(c.width * 12)))
    .map((n) => `minmax(0, ${n}fr)`)
    .join(' ');

  const renderElement = (el: FooterElement, ci: number, ei: number) => {
    const isSel = selected?.col === ci && selected?.el === ei;
    const frame = (node: ReactNode) => (
      <div
        key={ei}
        className={`fd-preview-el ${isSel ? 'is-selected' : ''}`}
        onClick={() => onSelect(ci, ei)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onSelect(ci, ei)}
      >
        {node}
      </div>
    );
    const size = el.config.size;
    const H = ({ children }: { children: ReactNode }) => (
      <h4 style={{ margin: 0, color: heading ?? fg, fontWeight: 700, fontSize: px(BASE.heading, size) }}>{children}</h4>
    );
    const A = ({ href, fs, children }: { href?: string | null; fs: number; children: ReactNode }) => (
      <a href={href ?? '#'} onClick={(e) => e.preventDefault()} style={{ color: link, fontSize: fs, textDecoration: 'none' }}>
        {children}
      </a>
    );

    switch (el.type) {
      case 'heading':
        return frame(<H>{pick(el.config.text ?? {}, lang) || 'تیتر'}</H>);
      case 'text':
        return frame(
          <p style={{ margin: 0, whiteSpace: 'pre-line', lineHeight: 1.9, fontSize: px(BASE.text, size), color: muted }}>
            {pick(el.config.text ?? {}, lang) || 'متن…'}
          </p>,
        );
      case 'links':
        return frame(
          <div style={{ display: 'grid', gap: 6 }}>
            {((el.config.items as FooterLinkItem[]) ?? []).map((it, i) => (
              <A key={i} href={it.link} fs={px(BASE.link, size)}>
                {pick(it.text, lang) || 'لینک'}
              </A>
            ))}
          </div>,
        );
      case 'contact':
        return frame(
          <div style={{ display: 'grid', gap: 6 }}>
            {((el.config.items as FooterContactItem[]) ?? []).map((it, i) => (
              <span key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', color: fg, fontSize: px(BASE.link, size) }}>
                <span style={{ color: muted }}>
                  <FooterIcon name={it.icon} size={px(BASE.contactIcon, size)} />
                </span>
                {it.link ? <A href={it.link} fs={px(BASE.link, size)}>{pick(it.text, lang)}</A> : pick(it.text, lang)}
              </span>
            ))}
          </div>,
        );
      case 'logo':
        return frame(
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: al(el.config.align), gap: 6 }}>
            {el.config.logo && (
              <span
                style={{
                  display: 'inline-grid', placeItems: 'center', borderRadius: 8, border: `1px dashed ${muted}`, color: muted, fontSize: 11,
                  width: px(BASE.logoW, size), height: px(BASE.logoH, size),
                }}
              >
                لوگو
              </span>
            )}
            {el.config.textOn && <span style={{ color: fg, fontWeight: 800, fontSize: px(BASE.logoText, size) }}>نام فروشگاه</span>}
          </div>,
        );
      case 'newsletter':
        return frame(
          <form onSubmit={noop} style={{ display: 'flex', gap: 6, fontSize: px(BASE.link, size) }}>
            <input
              className="fd-preview-input"
              placeholder="ایمیل شما"
              dir="ltr"
              style={{ background: 'rgba(255,255,255,.08)', border: `1px solid ${muted}`, color: fg, fontSize: px(BASE.link, size) }}
            />
            <button style={{ background: '#28a745', border: 0, color: '#fff', padding: '0 12px', borderRadius: 8, fontSize: px(12, size) }} type="submit">
              عضویت
            </button>
          </form>,
        );
      case 'socials':
        return frame(
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(model.socials.length ? model.socials.map((s) => s.network) : ['instagram', 'telegram', 'whatsapp']).map((n) => (
              <span
                key={n}
                style={{
                  display: 'grid', placeItems: 'center', borderRadius: '50%', background: 'rgba(255,255,255,.1)', color: fg,
                  width: px(BASE.social, size), height: px(BASE.social, size),
                }}
              >
                <FooterIcon name={n} size={px(BASE.socialIcon, size)} />
              </span>
            ))}
          </div>,
        );
      case 'image':
        return frame(
          <div style={{ display: 'flex', justifyContent: al(el.config.align) }}>
            {el.config.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={el.config.imageUrl} alt="" style={{ height: px(BASE.imageH, size), maxWidth: '100%', objectFit: 'contain' }} />
            ) : (
              <span style={{ width: px(BASE.logoW, size), height: px(BASE.logoH, size), borderRadius: 8, border: `1px dashed ${muted}`, display: 'inline-block' }} />
            )}
          </div>,
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #e4e1da', background: bg }}>
      <div style={{ padding: '28px 20px', display: 'grid', gap: 20, gridTemplateColumns: rows }}>
        {model.columns.map((c, ci) => (
          <div key={ci} style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
            {c.elements.map((el, ei) => renderElement(el, ci, ei))}
            {c.elements.length === 0 && (
              <span style={{ fontSize: 11, color: muted, border: `1px dashed ${muted}`, borderRadius: 6, padding: '10px 8px', textAlign: 'center' }}>
                ستون خالی
              </span>
            )}
          </div>
        ))}
      </div>
      <div
        style={{
          borderTop: `1px solid ${model.theme === 'custom' ? `${fg}22` : 'rgba(255,255,255,.15)'}`,
          padding: '12px 16px',
          textAlign: 'center',
          fontSize: 12,
          color: muted,
        }}
      >
        © {new Date().getFullYear()} نام فروشگاه — {pick(model.copyright, lang)}
        {model.pageSlug[lang] ? <span style={{ textDecoration: 'underline' }}> (لینک صفحه)</span> : null}
      </div>
    </div>
  );
}
