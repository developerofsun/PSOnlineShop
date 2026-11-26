import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Divider, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tag } from 'antd';
import { useState } from 'react';
import ImageUpload from '../components/ImageUpload';
import LangTabs from '../components/LangTabs';
import { api } from '../lib/api';
import { formatNumber } from '../lib/format';
import type { SlideForm, SlideStyle, SliderDetail, SliderRow } from '../lib/types';

const ALIGN_OPTIONS = [
  { value: 'start', label: 'ابتدای اسلاید' },
  { value: 'center', label: 'وسط' },
  { value: 'end', label: 'انتهای اسلاید' },
];

/** Where a slide is shown. Hiding a slide on phones is the usual reason to use it. */
export const DEVICE_OPTIONS = [
  { value: 'all', label: 'همه دستگاه‌ها' },
  { value: 'desktop', label: 'فقط کامپیوتر / تبلت بزرگ' },
  { value: 'mobile', label: 'فقط موبایل' },
];

/** An empty new slide: everything shown, colours follow the site theme. */
function newSlide(): SlideForm {
  return {
    imageUrl: '',
    linkUrl: '',
    title: {},
    subtitle: {},
    buttonText: {},
    style: {
      showText: true,
      showButton: true,
      showBackground: true,
      backgroundColor: null,
      overlayColor: null,
      textColor: null,
      buttonColor: null,
      buttonTextColor: null,
      textAlign: 'start',
      device: 'all',
    },
  };
}

/** Hex colour input with a native swatch; empty means "use the default colour". */
function ColorField({ value, onChange, placeholder }: { value?: string | null; onChange?: (v: string | null) => void; placeholder?: string }) {
  const hex = value ?? '';
  return (
    <Space.Compact style={{ width: '100%' }}>
      <Input
        dir="ltr"
        value={hex}
        placeholder={placeholder ?? 'پیش‌فرض'}
        allowClear
        onChange={(e) => onChange?.(e.target.value.trim() || null)}
      />
      <input
        type="color"
        value={hex || '#ffffff'}
        title="انتخاب رنگ"
        onChange={(e) => onChange?.(e.target.value)}
        style={{ width: 40, padding: 2, border: '1px solid #d9d9d9', borderRadius: 6, background: '#fff', cursor: 'pointer' }}
      />
    </Space.Compact>
  );
}

const COLOR_FIELDS: { name: keyof SlideStyle; label: string; hint: string }[] = [
  { name: 'backgroundColor', label: 'رنگ پس‌زمینه', hint: 'بدون تصویر' },
  { name: 'overlayColor', label: 'رنگ پرده‌ی متن', hint: 'پشت متن‌ها' },
  { name: 'textColor', label: 'رنگ متن', hint: '#ffffff' },
  { name: 'buttonColor', label: 'رنگ دکمه', hint: '#ffffff' },
  { name: 'buttonTextColor', label: 'رنگ متن دکمه', hint: '#1a6e2e' },
];

export default function SlidersPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<SliderDetail>();
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, isFetching } = useQuery({ queryKey: ['sliders'], queryFn: () => api.get<SliderRow[]>('/api/admin/sliders') });

  async function open(id: number | 'new') {
    form.resetFields();
    setEditing(id);
    if (id === 'new') {
      form.setFieldsValue({ name: '', isActive: true, slides: [newSlide()] });
      return;
    }
    const s = await api.get<SliderDetail>(`/api/admin/sliders/${id}`);
    form.setFieldsValue(s);
  }

  async function save() {
    const v = await form.validateFields();
    setSaving(true);
    try {
      const body = {
        name: v.name,
        isActive: v.isActive ?? true,
        slides: (v.slides ?? []).map((s) => ({
          imageUrl: s.imageUrl ?? '',
          linkUrl: s.linkUrl || null,
          title: s.title ?? {},
          subtitle: s.subtitle ?? {},
          buttonText: s.buttonText ?? {},
          style: s.style ?? null,
        })),
      };
      if (editing === 'new') await api.post('/api/admin/sliders', body);
      else await api.put(`/api/admin/sliders/${editing}`, body);
      message.success('ذخیره شد');
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['sliders'] });
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-title">
        <h1>اسلایدرها</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => void open('new')}>
          افزودن اسلایدر
        </Button>
      </div>

      <Table
        rowKey="id"
        loading={isFetching}
        dataSource={data ?? []}
        pagination={false}
        columns={[
          { title: 'نام', dataIndex: 'name' },
          { title: 'تعداد اسلاید', dataIndex: 'slideCount', render: (v: number) => formatNumber(v) },
          { title: 'وضعیت', dataIndex: 'isActive', render: (v: boolean) => (v ? <Tag color="green">فعال</Tag> : <Tag>غیرفعال</Tag>) },
          {
            title: 'عملیات',
            render: (_, r) => (
              <>
                <Button type="link" onClick={() => void open(r.id)}>
                  ویرایش
                </Button>
                <Popconfirm
                  title="حذف این اسلایدر؟ بلوک‌های صفحه که از آن استفاده می‌کنند دیگر نمایش داده نمی‌شوند."
                  okText="حذف"
                  cancelText="انصراف"
                  onConfirm={async () => {
                    await api.del(`/api/admin/sliders/${r.id}`);
                    void qc.invalidateQueries({ queryKey: ['sliders'] });
                  }}
                >
                  <Button type="link" danger>
                    حذف
                  </Button>
                </Popconfirm>
              </>
            ),
          },
        ]}
      />

      <Modal
        open={editing !== null}
        title={editing === 'new' ? 'افزودن اسلایدر' : 'ویرایش اسلایدر'}
        okText="ذخیره"
        cancelText="انصراف"
        confirmLoading={saving}
        onOk={() => void save()}
        onCancel={() => setEditing(null)}
        width={720}
        forceRender
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="نام (فقط برای مدیریت)" rules={[{ required: true, message: 'الزامی است' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="isActive" label="فعال" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.List name="slides">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field, idx) => (
                  <Card
                    key={field.key}
                    size="small"
                    style={{ marginBottom: 12 }}
                    title={`اسلاید ${idx + 1}`}
                    extra={<Button danger size="small" icon={<DeleteOutlined />} onClick={() => remove(field.name)} />}
                  >
                    <Form.Item name={[field.name, 'imageUrl']} label="تصویر (خالی = پس‌زمینه رنگی)">
                      <ImageUpload />
                    </Form.Item>
                    <Form.Item name={[field.name, 'linkUrl']} label="لینک (مثلاً /products یا https://...)">
                      <Input dir="ltr" />
                    </Form.Item>
                    <LangTabs>
                      {(code, dir) => (
                        <>
                          <Form.Item name={[field.name, 'title', code]} label="عنوان">
                            <Input dir={dir} />
                          </Form.Item>
                          <Form.Item name={[field.name, 'subtitle', code]} label="زیرعنوان">
                            <Input dir={dir} />
                          </Form.Item>
                          <Form.Item name={[field.name, 'buttonText', code]} label="متن دکمه">
                            <Input dir={dir} />
                          </Form.Item>
                        </>
                      )}
                    </LangTabs>

                    <Divider orientation="right" plain style={{ margin: '4px 0 12px' }}>
                      ظاهر اسلاید
                    </Divider>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
                      <Form.Item name={[field.name, 'style', 'showText']} label="نمایش متن‌ها" valuePropName="checked">
                        <Switch size="small" />
                      </Form.Item>
                      <Form.Item name={[field.name, 'style', 'showButton']} label="نمایش دکمه" valuePropName="checked">
                        <Switch size="small" />
                      </Form.Item>
                      <Form.Item name={[field.name, 'style', 'showBackground']} label="نمایش پس‌زمینه" valuePropName="checked">
                        <Switch size="small" />
                      </Form.Item>
                      <Form.Item name={[field.name, 'style', 'textAlign']} label="جهت متن‌ها">
                        <Select options={ALIGN_OPTIONS} />
                      </Form.Item>
                      <Form.Item name={[field.name, 'style', 'device']} label="نمایش روی" extra="مثلاً اسلاید تصویری فقط برای کامپیوتر">
                        <Select options={DEVICE_OPTIONS} />
                      </Form.Item>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8 }}>
                      {COLOR_FIELDS.map((c) => (
                        <Form.Item key={c.name} name={[field.name, 'style', c.name]} label={c.label}>
                          <ColorField placeholder={c.hint} />
                        </Form.Item>
                      ))}
                    </div>
                  </Card>
                ))}
                <Button block icon={<PlusOutlined />} onClick={() => add(newSlide())}>
                  افزودن اسلاید
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </>
  );
}
