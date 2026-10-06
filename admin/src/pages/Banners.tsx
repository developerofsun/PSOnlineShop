import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, Input, Modal, Popconfirm, Switch, Table, Tag } from 'antd';
import { useState } from 'react';
import ImageUpload from '../components/ImageUpload';
import LangTabs from '../components/LangTabs';
import { api } from '../lib/api';
import type { BannerRow } from '../lib/types';

export default function BannersPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<BannerRow>();
  const [editing, setEditing] = useState<BannerRow | 'new' | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, isFetching } = useQuery({ queryKey: ['banners'], queryFn: () => api.get<BannerRow[]>('/api/admin/banners') });

  function open(b: BannerRow | 'new') {
    form.resetFields();
    setEditing(b);
    form.setFieldsValue(b === 'new' ? { name: '', imageUrl: '', linkUrl: '', title: {}, isActive: true } : b);
  }

  async function save() {
    const v = await form.validateFields();
    setSaving(true);
    try {
      const body = { name: v.name, imageUrl: v.imageUrl ?? '', linkUrl: v.linkUrl || null, title: v.title ?? {}, isActive: v.isActive ?? true };
      if (editing === 'new') await api.post('/api/admin/banners', body);
      else if (editing) await api.put(`/api/admin/banners/${editing.id}`, body);
      message.success('ذخیره شد');
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['banners'] });
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-title">
        <h1>بنرها</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open('new')}>
          افزودن بنر
        </Button>
      </div>

      <Table
        rowKey="id"
        loading={isFetching}
        dataSource={data ?? []}
        pagination={false}
        columns={[
          { title: '', dataIndex: 'imageUrl', width: 90, render: (v: string) => (v ? <img src={v} alt="" style={{ width: 72, height: 40, objectFit: 'cover', borderRadius: 6 }} /> : null) },
          { title: 'نام', dataIndex: 'name' },
          { title: 'لینک', dataIndex: 'linkUrl', render: (v: string | null) => <span dir="ltr">{v ?? '—'}</span> },
          { title: 'وضعیت', dataIndex: 'isActive', render: (v: boolean) => (v ? <Tag color="green">فعال</Tag> : <Tag>غیرفعال</Tag>) },
          {
            title: 'عملیات',
            render: (_, r) => (
              <>
                <Button type="link" onClick={() => open(r)}>
                  ویرایش
                </Button>
                <Popconfirm
                  title="این بنر حذف شود؟"
                  okText="حذف"
                  cancelText="انصراف"
                  onConfirm={async () => {
                    await api.del(`/api/admin/banners/${r.id}`);
                    void qc.invalidateQueries({ queryKey: ['banners'] });
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
        title={editing === 'new' ? 'افزودن بنر' : 'ویرایش بنر'}
        okText="ذخیره"
        cancelText="انصراف"
        confirmLoading={saving}
        onOk={() => void save()}
        onCancel={() => setEditing(null)}
        forceRender
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="نام (فقط برای مدیریت)" rules={[{ required: true, message: 'الزامی است' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="imageUrl" label="تصویر (خالی = پس‌زمینه رنگی)">
            <ImageUpload />
          </Form.Item>
          <Form.Item name="linkUrl" label="لینک">
            <Input dir="ltr" placeholder="/products?onSale=true" />
          </Form.Item>
          <LangTabs>
            {(code, dir) => (
              <Form.Item name={['title', code]} label="عنوان روی بنر">
                <Input dir={dir} />
              </Form.Item>
            )}
          </LangTabs>
          <Form.Item name="isActive" label="فعال" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
