import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Switch, Table, Tabs, Tag } from 'antd';
import { useState } from 'react';
import ImageUpload from '../components/ImageUpload';
import { api } from '../lib/api';
import { formatNumber } from '../lib/format';
import { LANGS, type CategoryDetail, type CategoryItem, type CategoryTranslation } from '../lib/types';

type FormValues = {
  parentId: number | null;
  sortOrder: number;
  isActive: boolean;
  imageUrl?: string;
  tr: Record<string, Partial<CategoryTranslation>>;
};

export default function CategoriesPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, isFetching } = useQuery({ queryKey: ['categories'], queryFn: () => api.get<CategoryItem[]>('/api/admin/categories') });

  async function open(id: number | 'new') {
    form.resetFields();
    setEditing(id);
    if (id === 'new') {
      form.setFieldsValue({ parentId: null, sortOrder: 0, isActive: true, tr: {} });
      return;
    }
    const c = await api.get<CategoryDetail>(`/api/admin/categories/${id}`);
    const tr: FormValues['tr'] = {};
    for (const t of c.translations) tr[t.lang] = t;
    form.setFieldsValue({ parentId: c.parentId, sortOrder: c.sortOrder, isActive: c.isActive, imageUrl: c.imageUrl ?? '', tr });
  }

  async function save() {
    const v = await form.validateFields();
    setSaving(true);
    try {
      const body = {
        parentId: v.parentId ?? null,
        sortOrder: v.sortOrder ?? 0,
        isActive: v.isActive ?? true,
        imageUrl: v.imageUrl || null,
        translations: LANGS.map((l) => ({ lang: l.code, ...(v.tr?.[l.code] ?? {}) })).filter((t) => (t as Partial<CategoryTranslation>).name?.trim()),
      };
      if (editing === 'new') await api.post('/api/admin/categories', body);
      else await api.put(`/api/admin/categories/${editing}`, body);
      message.success('ذخیره شد');
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['categories'] });
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-title">
        <h1>دسته‌بندی‌ها</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => void open('new')}>
          افزودن دسته
        </Button>
      </div>

      <Table
        rowKey="id"
        loading={isFetching}
        dataSource={data ?? []}
        pagination={false}
        columns={[
          { title: 'نام', dataIndex: 'name' },
          { title: 'والد', dataIndex: 'parentId', render: (v: number | null) => data?.find((c) => c.id === v)?.name ?? '—' },
          { title: 'محصولات', dataIndex: 'productCount', render: (v: number) => formatNumber(v) },
          { title: 'ترتیب', dataIndex: 'sortOrder', render: (v: number) => formatNumber(v) },
          { title: 'وضعیت', dataIndex: 'isActive', render: (v: boolean) => (v ? <Tag color="green">فعال</Tag> : <Tag>غیرفعال</Tag>) },
          {
            title: 'عملیات',
            render: (_, r) => (
              <>
                <Button type="link" onClick={() => void open(r.id)}>
                  ویرایش
                </Button>
                <Popconfirm
                  title="حذف این دسته؟"
                  okText="حذف"
                  cancelText="انصراف"
                  onConfirm={async () => {
                    try {
                      await api.del(`/api/admin/categories/${r.id}`);
                      void qc.invalidateQueries({ queryKey: ['categories'] });
                    } catch (e) {
                      message.error(e instanceof Error ? e.message : 'خطا');
                    }
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
        title={editing === 'new' ? 'افزودن دسته' : 'ویرایش دسته'}
        okText="ذخیره"
        cancelText="انصراف"
        confirmLoading={saving}
        onOk={() => void save()}
        onCancel={() => setEditing(null)}
        forceRender
        destroyOnClose={false}
      >
        <Form form={form} layout="vertical">
          <Tabs
            items={LANGS.map((l) => ({
              key: l.code,
              label: l.label,
              forceRender: true,
              children: (
                <>
                  <Form.Item name={['tr', l.code, 'name']} label="نام" rules={l.code === 'fa' ? [{ required: true, message: 'نام فارسی الزامی است' }] : []}>
                    <Input dir={l.code === 'fa' ? 'rtl' : 'ltr'} />
                  </Form.Item>
                  <Form.Item name={['tr', l.code, 'slug']} label="نامک (خالی = خودکار)">
                    <Input dir="ltr" />
                  </Form.Item>
                </>
              ),
            }))}
          />
          <Form.Item name="parentId" label="دسته والد">
            <Select
              allowClear
              options={(data ?? []).filter((c) => c.id !== editing).map((c) => ({ value: c.id, label: c.name ?? `#${c.id}` }))}
            />
          </Form.Item>
          <Form.Item name="imageUrl" label="تصویر دسته (نمایش در صفحه اصلی)">
            <ImageUpload />
          </Form.Item>
          <Form.Item name="sortOrder" label="ترتیب نمایش">
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="isActive" label="فعال" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
