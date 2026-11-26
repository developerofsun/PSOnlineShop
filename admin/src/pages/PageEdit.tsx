import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Col, Form, Input, InputNumber, Row, Select, Space, Switch } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import LangTabs from '../components/LangTabs';
import { api } from '../lib/api';
import { LANGS, type BannerRow, type BlockForm, type CategoryItem, type L10n, type PageDetail, type SliderRow, type TextRow } from '../lib/types';

type PageForm = {
  isPublished: boolean;
  isHome: boolean;
  tr: Record<string, { title?: string; slug?: string; seoTitle?: string; seoDescription?: string }>;
};

const BLOCK_TYPES = [
  { value: 'slider', label: 'اسلایدر' },
  { value: 'banner', label: 'بنر ثابت' },
  { value: 'text', label: 'متن ثابت' },
  { value: 'products', label: 'محصولات (بر اساس دسته)' },
  { value: 'categories', label: 'فهرست دسته‌بندی‌ها' },
];
const typeLabel = (t: string) => BLOCK_TYPES.find((b) => b.value === t)?.label ?? t;

/** Where a block is shown; the storefront hides it with CSS, so both versions stay server-rendered. */
const DEVICES = [
  { value: 'all', label: 'همه دستگاه‌ها' },
  { value: 'desktop', label: 'فقط کامپیوتر' },
  { value: 'mobile', label: 'فقط موبایل' },
];

const SORTS = [
  { value: 'newest', label: 'جدیدترین' },
  { value: 'discount', label: 'بیشترین تخفیف' },
  { value: 'price_asc', label: 'ارزان‌ترین' },
  { value: 'price_desc', label: 'گران‌ترین' },
];

export default function PageEditPage() {
  const { id } = useParams();
  const isNew = !id;
  const nav = useNavigate();
  const qc = useQueryClient();
  const { message } = App.useApp();
  const [form] = Form.useForm<PageForm>();
  const [blocks, setBlocks] = useState<BlockForm[]>([]);
  const [newType, setNewType] = useState<string>('slider');
  const [saving, setSaving] = useState(false);

  const { data: page, isLoading } = useQuery({
    queryKey: ['page', id],
    queryFn: () => api.get<PageDetail>(`/api/admin/pages/${id}`),
    enabled: !isNew,
  });
  const { data: sliders } = useQuery({ queryKey: ['sliders'], queryFn: () => api.get<SliderRow[]>('/api/admin/sliders') });
  const { data: banners } = useQuery({ queryKey: ['banners'], queryFn: () => api.get<BannerRow[]>('/api/admin/banners') });
  const { data: texts } = useQuery({ queryKey: ['texts'], queryFn: () => api.get<TextRow[]>('/api/admin/texts') });
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => api.get<CategoryItem[]>('/api/admin/categories') });

  useEffect(() => {
    if (!page) return;
    const tr: PageForm['tr'] = {};
    for (const t of page.translations) tr[t.lang] = { title: t.title, slug: t.slug ?? '', seoTitle: t.seoTitle ?? '', seoDescription: t.seoDescription ?? '' };
    form.setFieldsValue({ isPublished: page.isPublished, isHome: page.isHome, tr });
    setBlocks(page.blocks);
  }, [page, form]);

  const patchBlock = (i: number, patch: Partial<BlockForm>) => setBlocks((bs) => bs.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const patchConfig = (i: number, patch: Record<string, unknown>) =>
    setBlocks((bs) => bs.map((b, idx) => (idx === i ? { ...b, config: { ...b.config, ...patch } } : b)));
  const move = (i: number, d: -1 | 1) =>
    setBlocks((bs) => {
      const j = i + d;
      if (j < 0 || j >= bs.length) return bs;
      const copy = [...bs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  async function onFinish(v: PageForm) {
    setSaving(true);
    try {
      const body = {
        isPublished: v.isPublished ?? true,
        isHome: v.isHome ?? false,
        translations: LANGS.map((l) => ({ lang: l.code, title: v.tr?.[l.code]?.title ?? '', slug: v.tr?.[l.code]?.slug || null, seoTitle: v.tr?.[l.code]?.seoTitle || null, seoDescription: v.tr?.[l.code]?.seoDescription || null })).filter(
          (t) => t.title.trim(),
        ),
        blocks,
      };
      if (isNew) {
        const created = await api.post<PageDetail>('/api/admin/pages', body);
        message.success('صفحه ایجاد شد');
        nav(`/pages/${created.id}`, { replace: true });
      } else {
        await api.put(`/api/admin/pages/${id}`, body);
        message.success('ذخیره شد');
      }
      void qc.invalidateQueries({ queryKey: ['pages'] });
      void qc.invalidateQueries({ queryKey: ['page', id] });
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  }

  const titleOf = (cfg: Record<string, unknown>, lang: string) => ((cfg.title as L10n | undefined) ?? {})[lang] ?? '';
  const setTitle = (i: number, cfg: Record<string, unknown>, lang: string, value: string) =>
    patchConfig(i, { title: { ...((cfg.title as L10n | undefined) ?? {}), [lang]: value } });

  function renderConfig(b: BlockForm, i: number) {
    const cfg = b.config;
    const select = (key: string, options: { value: number; label: string }[], placeholder: string) => (
      <Select
        style={{ width: '100%' }}
        placeholder={placeholder}
        value={(cfg[key] as number | undefined) ?? undefined}
        options={options}
        onChange={(v) => patchConfig(i, { [key]: v })}
        showSearch
        optionFilterProp="label"
      />
    );
    const titles = (
      <Row gutter={8}>
        {LANGS.map((l) => (
          <Col key={l.code} xs={24} md={12}>
            <Input
              dir={l.code === 'fa' ? 'rtl' : 'ltr'}
              placeholder={`عنوان بخش (${l.label})`}
              value={titleOf(cfg, l.code)}
              onChange={(e) => setTitle(i, cfg, l.code, e.target.value)}
            />
          </Col>
        ))}
      </Row>
    );

    switch (b.type) {
      case 'slider':
        return select('sliderId', (sliders ?? []).map((s) => ({ value: s.id, label: s.name })), 'اسلایدر را انتخاب کنید');
      case 'banner':
        return select('bannerId', (banners ?? []).map((x) => ({ value: x.id, label: x.name })), 'بنر را انتخاب کنید');
      case 'text':
        return select('textId', (texts ?? []).map((x) => ({ value: x.id, label: `${x.name} (${x.key})` })), 'متن را انتخاب کنید');
      case 'categories':
        return titles;
      case 'products':
        return (
          <Space direction="vertical" style={{ width: '100%' }}>
            {titles}
            <Row gutter={8}>
              <Col xs={24} md={12}>
                <Select
                  allowClear
                  style={{ width: '100%' }}
                  placeholder="همه دسته‌ها"
                  value={(cfg.categoryId as number | undefined) ?? undefined}
                  options={(categories ?? []).map((c) => ({ value: c.id, label: c.name ?? `#${c.id}` }))}
                  onChange={(v) => patchConfig(i, { categoryId: v ?? null })}
                />
              </Col>
              <Col xs={12} md={7}>
                <Select style={{ width: '100%' }} value={(cfg.sort as string | undefined) ?? 'newest'} options={SORTS} onChange={(v) => patchConfig(i, { sort: v })} />
              </Col>
              <Col xs={12} md={5}>
                <InputNumber min={1} max={24} style={{ width: '100%' }} value={(cfg.limit as number | undefined) ?? 8} onChange={(v) => patchConfig(i, { limit: v ?? 8 })} addonAfter="عدد" />
              </Col>
            </Row>
          </Space>
        );
      default:
        return null;
    }
  }

  function addBlock() {
    const defaults: Record<string, Record<string, unknown>> = {
      slider: { device: 'all' },
      banner: { device: 'all' },
      text: { device: 'all' },
      categories: { title: {}, device: 'all' },
      products: { sort: 'newest', limit: 8, categoryId: null, title: {}, device: 'all' },
    };
    setBlocks((bs) => [...bs, { type: newType, isActive: true, config: defaults[newType] ?? {} }]);
  }

  return (
    <>
      <div className="page-title">
        <h1>{isNew ? 'افزودن صفحه' : 'ویرایش صفحه'}</h1>
      </div>

      <Form form={form} layout="vertical" disabled={!isNew && isLoading} initialValues={{ isPublished: true, isHome: false, tr: {} }} onFinish={onFinish}>
        <Row gutter={16}>
          <Col xs={24} lg={16}>
            <Card title="محتوای صفحه (بلوک‌ها)" style={{ marginBottom: 16 }}>
              {blocks.length === 0 && <Alert type="info" showIcon message="هنوز بلوکی اضافه نشده است. از پایین یک بلوک اضافه کنید." style={{ marginBottom: 12 }} />}

              {blocks.map((b, i) => (
                <Card
                  key={i}
                  size="small"
                  style={{ marginBottom: 12, opacity: b.isActive ? 1 : 0.6 }}
                  title={`${i + 1}. ${typeLabel(b.type)}`}
                  extra={
                    <Space>
                      <Switch size="small" checked={b.isActive} onChange={(v) => patchBlock(i, { isActive: v })} checkedChildren="فعال" unCheckedChildren="مخفی" />
                      <Button size="small" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(i, -1)} />
                      <Button size="small" icon={<ArrowDownOutlined />} disabled={i === blocks.length - 1} onClick={() => move(i, 1)} />
                      <Button size="small" danger icon={<DeleteOutlined />} onClick={() => setBlocks((bs) => bs.filter((_, idx) => idx !== i))} />
                    </Space>
                  }
                >
                  {renderConfig(b, i)}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <span style={{ fontSize: 12, color: '#666' }}>نمایش روی:</span>
                    <Select
                      size="small"
                      style={{ width: 220 }}
                      value={(b.config.device as string | undefined) ?? 'all'}
                      options={DEVICES}
                      onChange={(v) => patchConfig(i, { device: v })}
                    />
                  </div>
                </Card>
              ))}

              <Space.Compact style={{ width: '100%' }}>
                <Select style={{ flex: 1 }} value={newType} options={BLOCK_TYPES} onChange={setNewType} />
                <Button icon={<PlusOutlined />} onClick={addBlock}>
                  افزودن بلوک
                </Button>
              </Space.Compact>
            </Card>

            <Card title="عنوان و سئو">
              <LangTabs>
                {(code, dir) => (
                  <>
                    <Form.Item name={['tr', code, 'title']} label="عنوان صفحه" rules={code === 'fa' ? [{ required: true, message: 'عنوان فارسی الزامی است' }] : []}>
                      <Input dir={dir} />
                    </Form.Item>
                    <Form.Item name={['tr', code, 'slug']} label="نامک (خالی = خودکار)">
                      <Input dir="ltr" />
                    </Form.Item>
                    <Form.Item name={['tr', code, 'seoTitle']} label="عنوان سئو">
                      <Input dir={dir} />
                    </Form.Item>
                    <Form.Item name={['tr', code, 'seoDescription']} label="توضیحات سئو">
                      <Input.TextArea rows={2} dir={dir} />
                    </Form.Item>
                  </>
                )}
              </LangTabs>
            </Card>
          </Col>

          <Col xs={24} lg={8}>
            <Card title="انتشار">
              <Form.Item name="isPublished" label="منتشر شود" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="isHome" label="صفحه اصلی فروشگاه باشد" valuePropName="checked" extra="فقط یک صفحه می‌تواند صفحه اصلی باشد.">
                <Switch />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={saving} block>
                {isNew ? 'انتشار' : 'ذخیره تغییرات'}
              </Button>
            </Card>
          </Col>
        </Row>
      </Form>
    </>
  );
}
