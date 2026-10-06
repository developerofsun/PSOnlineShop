import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Form, Input, InputNumber, Modal, Popconfirm, Switch, Table, Tag } from 'antd';
import { useState } from 'react';
import ImageUpload from '../components/ImageUpload';
import LangTabs from '../components/LangTabs';
import { api } from '../lib/api';
import { formatDate, formatNumber } from '../lib/format';
import type { StoryDetail, StoryRow } from '../lib/types';

type FormValues = Omit<StoryDetail, 'id' | 'expiresAt'> & { expiresAt: string };

/** ISO (UTC) -> value for <input type="datetime-local"> in the admin's local time. */
const toLocalInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const emptyItem = { imageUrl: '', linkUrl: '', caption: {}, durationSec: 5 };

export default function StoriesPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, isFetching } = useQuery({ queryKey: ['stories'], queryFn: () => api.get<StoryRow[]>('/api/admin/stories') });

  async function open(id: number | 'new') {
    form.resetFields();
    setEditing(id);
    if (id === 'new') {
      form.setFieldsValue({ name: '', isActive: true, sortOrder: 0, coverUrl: '', title: {}, expiresAt: '', items: [{ ...emptyItem }] });
      return;
    }
    const s = await api.get<StoryDetail>(`/api/admin/stories/${id}`);
    form.setFieldsValue({ ...s, expiresAt: toLocalInput(s.expiresAt) });
  }

  async function save() {
    const v = await form.validateFields();
    setSaving(true);
    try {
      const body = {
        name: v.name,
        isActive: v.isActive ?? true,
        sortOrder: v.sortOrder ?? 0,
        coverUrl: v.coverUrl ?? '',
        title: v.title ?? {},
        expiresAt: v.expiresAt ? new Date(v.expiresAt).toISOString() : null,
        items: (v.items ?? []).map((i) => ({
          imageUrl: i.imageUrl ?? '',
          linkUrl: i.linkUrl || null,
          caption: i.caption ?? {},
          durationSec: i.durationSec ?? 5,
        })),
      };
      if (editing === 'new') await api.post('/api/admin/stories', body);
      else await api.put(`/api/admin/stories/${editing}`, body);
      message.success('ذخیره شد');
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['stories'] });
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  }

  const expired = (iso: string | null) => !!iso && new Date(iso) < new Date();

  return (
    <>
      <div className="page-title">
        <h1>استوری‌ها</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => void open('new')}>
          افزودن استوری
        </Button>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="استوری‌ها به‌صورت دایره در بالای صفحه اصلی فروشگاه نمایش داده می‌شوند. هر استوری چند اسلاید دارد (تصویر یا فقط متن) و می‌تواند تاریخ انقضا داشته باشد."
      />

      <Table
        rowKey="id"
        loading={isFetching}
        dataSource={data ?? []}
        pagination={false}
        scroll={{ x: 'max-content' }}
        columns={[
          { title: 'نام', dataIndex: 'name' },
          { title: 'اسلایدها', dataIndex: 'itemCount', render: (v: number) => formatNumber(v) },
          { title: 'ترتیب', dataIndex: 'sortOrder', render: (v: number) => formatNumber(v) },
          { title: 'انقضا', dataIndex: 'expiresAt', render: (v: string | null) => (v ? formatDate(v) : 'بدون انقضا') },
          {
            title: 'وضعیت',
            render: (_, r) =>
              expired(r.expiresAt) ? <Tag color="orange">منقضی‌شده</Tag> : r.isActive ? <Tag color="green">فعال</Tag> : <Tag>غیرفعال</Tag>,
          },
          {
            title: 'عملیات',
            render: (_, r) => (
              <>
                <Button type="link" onClick={() => void open(r.id)}>
                  ویرایش
                </Button>
                <Popconfirm
                  title="این استوری حذف شود؟"
                  okText="حذف"
                  cancelText="انصراف"
                  onConfirm={async () => {
                    await api.del(`/api/admin/stories/${r.id}`);
                    void qc.invalidateQueries({ queryKey: ['stories'] });
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
        title={editing === 'new' ? 'افزودن استوری' : 'ویرایش استوری'}
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
          <LangTabs>
            {(code, dir) => (
              <Form.Item name={['title', code]} label="عنوان زیر دایره">
                <Input dir={dir} maxLength={30} />
              </Form.Item>
            )}
          </LangTabs>
          <Form.Item name="coverUrl" label="تصویر دایره (خالی = حرف اول عنوان)">
            <ImageUpload />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <Form.Item name="sortOrder" label="ترتیب نمایش">
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="expiresAt" label="انقضا (اختیاری)">
              <Input type="datetime-local" dir="ltr" />
            </Form.Item>
            <Form.Item name="isActive" label="فعال" valuePropName="checked">
              <Switch />
            </Form.Item>
          </div>

          <Form.List name="items">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field, idx) => (
                  <Card
                    key={field.key}
                    size="small"
                    style={{ marginBottom: 12 }}
                    title={`اسلاید ${idx + 1}`}
                    extra={<Button danger size="small" icon={<DeleteOutlined />} disabled={fields.length === 1} onClick={() => remove(field.name)} />}
                  >
                    <Form.Item name={[field.name, 'imageUrl']} label="تصویر (عمودی بهتر است؛ خالی = پس‌زمینه رنگی با متن)">
                      <ImageUpload />
                    </Form.Item>
                    <LangTabs>
                      {(code, dir) => (
                        <Form.Item name={[field.name, 'caption', code]} label="متن روی اسلاید">
                          <Input.TextArea rows={2} dir={dir} maxLength={140} />
                        </Form.Item>
                      )}
                    </LangTabs>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 12 }}>
                      <Form.Item name={[field.name, 'linkUrl']} label="لینک (مثلاً /products?onSale=true)">
                        <Input dir="ltr" />
                      </Form.Item>
                      <Form.Item name={[field.name, 'durationSec']} label="مدت (ثانیه)">
                        <InputNumber min={3} max={15} style={{ width: '100%' }} />
                      </Form.Item>
                    </div>
                  </Card>
                ))}
                <Button block icon={<PlusOutlined />} disabled={fields.length >= 30} onClick={() => add({ ...emptyItem })}>
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
