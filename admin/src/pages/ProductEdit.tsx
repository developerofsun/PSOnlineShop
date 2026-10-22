import { DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Form, Input, InputNumber, Row, Select, Space, Switch, Tabs, Upload } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ImageEditorModal, { MAX_BULK_IMAGES } from '../components/ImageEditorModal';
import { api } from '../lib/api';
import { LANGS, type CategoryItem, type ProductDetail, type ProductTranslation } from '../lib/types';

type TrForm = Partial<Omit<ProductTranslation, 'lang'>>;
type FormValues = {
  sku: string;
  price: number;
  salePrice: number | null;
  stock: number;
  isPublished: boolean;
  categoryId: number | null;
  tr: Record<string, TrForm>;
};

export default function ProductEditPage() {
  const { id } = useParams();
  const isNew = !id;
  const nav = useNavigate();
  const qc = useQueryClient();
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [images, setImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<File[] | null>(null);

  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => api.get<CategoryItem[]>('/api/admin/categories') });
  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => api.get<ProductDetail>(`/api/admin/products/${id}`),
    enabled: !isNew,
  });

  useEffect(() => {
    if (!product) return;
    const tr: Record<string, TrForm> = {};
    for (const t of product.translations) tr[t.lang] = t;
    form.setFieldsValue({
      sku: product.sku,
      price: product.price,
      salePrice: product.salePrice,
      stock: product.stock,
      isPublished: product.isPublished,
      categoryId: product.categoryId,
      tr,
    });
    setImages(product.images);
  }, [product, form]);

  async function onFinish(v: FormValues) {
    setSaving(true);
    try {
      const body = {
        sku: v.sku,
        price: v.price ?? 0,
        salePrice: v.salePrice ?? null,
        stock: v.stock ?? 0,
        isPublished: v.isPublished ?? true,
        categoryId: v.categoryId ?? null,
        translations: LANGS.map((l) => ({ lang: l.code, ...(v.tr?.[l.code] ?? {}) })).filter((t) => (t as TrForm).name?.trim()),
        images,
      };
      if (isNew) {
        const created = await api.post<ProductDetail>('/api/admin/products', body);
        message.success('محصول ایجاد شد');
        nav(`/products/${created.id}`, { replace: true });
      } else {
        await api.put<ProductDetail>(`/api/admin/products/${id}`, body);
        message.success('ذخیره شد');
      }
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['product', id] });
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  }

  // Files picked in one go are collected, then opened together in the editor (max 10).
  const pickBuffer = useRef<File[]>([]);
  const pickTimer = useRef<number>();
  function collect(file: File) {
    pickBuffer.current.push(file);
    window.clearTimeout(pickTimer.current);
    pickTimer.current = window.setTimeout(() => {
      setEditing(pickBuffer.current);
      pickBuffer.current = [];
    }, 50);
  }

  return (
    <>
      <div className="page-title">
        <h1>{isNew ? 'افزودن محصول' : 'ویرایش محصول'}</h1>
      </div>

      <Form
        form={form}
        layout="vertical"
        disabled={!isNew && isLoading}
        initialValues={{ isPublished: true, stock: 0, price: 0, tr: {} }}
        onFinish={onFinish}
      >
        <Row gutter={16}>
          <Col xs={24} lg={16}>
            <Card style={{ marginBottom: 16 }}>
              <Tabs
                items={LANGS.map((l) => ({
                  key: l.code,
                  label: l.label,
                  forceRender: true, // keep fields of hidden tabs in the form
                  children: (
                    <>
                      <Form.Item
                        name={['tr', l.code, 'name']}
                        label="نام محصول"
                        rules={l.code === 'fa' ? [{ required: true, message: 'نام فارسی الزامی است' }] : []}
                      >
                        <Input dir={l.code === 'fa' ? 'rtl' : 'ltr'} />
                      </Form.Item>
                      <Form.Item name={['tr', l.code, 'slug']} label="نامک (خالی = خودکار)">
                        <Input dir="ltr" />
                      </Form.Item>
                      <Form.Item name={['tr', l.code, 'shortDescription']} label="توضیح کوتاه">
                        <Input.TextArea rows={2} dir={l.code === 'fa' ? 'rtl' : 'ltr'} />
                      </Form.Item>
                      <Form.Item name={['tr', l.code, 'description']} label="توضیحات کامل">
                        <Input.TextArea rows={7} dir={l.code === 'fa' ? 'rtl' : 'ltr'} />
                      </Form.Item>
                      <Form.Item name={['tr', l.code, 'seoTitle']} label="عنوان سئو">
                        <Input dir={l.code === 'fa' ? 'rtl' : 'ltr'} />
                      </Form.Item>
                      <Form.Item name={['tr', l.code, 'seoDescription']} label="توضیحات سئو">
                        <Input.TextArea rows={2} dir={l.code === 'fa' ? 'rtl' : 'ltr'} />
                      </Form.Item>
                    </>
                  ),
                }))}
              />
            </Card>

            <Card title="تصاویر">
              <Space wrap>
                {images.map((url, i) => (
                  <div key={url} style={{ position: 'relative' }}>
                    <img src={url} alt="" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                    {i === 0 && (
                      <span style={{ position: 'absolute', bottom: 4, insetInlineStart: 4, background: '#1d4ed8', color: '#fff', fontSize: 11, padding: '0 6px', borderRadius: 4 }}>
                        اصلی
                      </span>
                    )}
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      style={{ position: 'absolute', top: 4, insetInlineEnd: 4 }}
                      onClick={() => setImages((p) => p.filter((x) => x !== url))}
                    />
                  </div>
                ))}
                <Upload
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  showUploadList={false}
                  multiple
                  beforeUpload={(file) => {
                    collect(file);
                    return false;
                  }}
                >
                  <Button icon={<UploadOutlined />}>آپلود و ویرایش (حداکثر {MAX_BULK_IMAGES})</Button>
                </Upload>
              </Space>
            </Card>
            <ImageEditorModal
              files={editing}
              onClose={() => setEditing(null)}
              onDone={(urls) => {
                setImages((prev) => [...prev, ...urls]);
                setEditing(null);
              }}
            />
          </Col>

          <Col xs={24} lg={8}>
            <Card title="انتشار و قیمت">
              <Form.Item name="isPublished" label="منتشر شود" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="sku" label="کد کالا (SKU)" rules={[{ required: true, message: 'الزامی است' }]}>
                <Input dir="ltr" />
              </Form.Item>
              <Form.Item name="price" label="قیمت (تومان)" rules={[{ required: true, message: 'الزامی است' }]}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="salePrice" label="قیمت حراج (اختیاری)">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="stock" label="موجودی">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="categoryId" label="دسته‌بندی">
                <Select
                  allowClear
                  placeholder="انتخاب دسته"
                  options={(categories ?? []).map((c) => ({ value: c.id, label: c.name ?? `#${c.id}` }))}
                />
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
