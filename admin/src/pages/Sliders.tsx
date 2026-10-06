import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Form, Input, Modal, Popconfirm, Switch, Table, Tag } from 'antd';
import { useState } from 'react';
import ImageUpload from '../components/ImageUpload';
import LangTabs from '../components/LangTabs';
import { api } from '../lib/api';
import { formatNumber } from '../lib/format';
import type { SliderDetail, SliderRow } from '../lib/types';

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
      form.setFieldsValue({ name: '', isActive: true, slides: [{ imageUrl: '', linkUrl: '', title: {}, subtitle: {}, buttonText: {} }] });
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
                  </Card>
                ))}
                <Button block icon={<PlusOutlined />} onClick={() => add({ imageUrl: '', linkUrl: '', title: {}, subtitle: {}, buttonText: {} })}>
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
