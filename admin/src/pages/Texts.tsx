import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Form, Input, Modal, Popconfirm, Switch, Table, Tag } from 'antd';
import { useState } from 'react';
import LangTabs from '../components/LangTabs';
import { api } from '../lib/api';
import type { TextRow } from '../lib/types';

export default function TextsPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<TextRow>();
  const [editing, setEditing] = useState<TextRow | 'new' | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, isFetching } = useQuery({ queryKey: ['texts'], queryFn: () => api.get<TextRow[]>('/api/admin/texts') });

  function open(t: TextRow | 'new') {
    form.resetFields();
    setEditing(t);
    form.setFieldsValue(t === 'new' ? { name: '', key: '', content: {}, isActive: true } : t);
  }

  async function save() {
    const v = await form.validateFields();
    setSaving(true);
    try {
      const body = { name: v.name, key: v.key, content: v.content ?? {}, isActive: v.isActive ?? true };
      if (editing === 'new') await api.post('/api/admin/texts', body);
      else if (editing) await api.put(`/api/admin/texts/${editing.id}`, body);
      message.success('ذخیره شد');
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['texts'] });
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-title">
        <h1>متن‌های ثابت</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open('new')}>
          افزودن متن
        </Button>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={
          <>
            متن با کلید <b dir="ltr">footer</b> در پایین همه صفحات فروشگاه نمایش داده می‌شود. سایر متن‌ها را می‌توانید در «صفحات» به‌صورت بلوک قرار دهید.
          </>
        }
      />

      <Table
        rowKey="id"
        loading={isFetching}
        dataSource={data ?? []}
        pagination={false}
        columns={[
          { title: 'نام', dataIndex: 'name' },
          { title: 'کلید', dataIndex: 'key', render: (v: string) => <span dir="ltr">{v}</span> },
          { title: 'پیش‌نمایش', dataIndex: 'content', ellipsis: true, render: (c: Record<string, string>) => c.fa ?? c.en ?? '—' },
          { title: 'وضعیت', dataIndex: 'isActive', render: (v: boolean) => (v ? <Tag color="green">فعال</Tag> : <Tag>غیرفعال</Tag>) },
          {
            title: 'عملیات',
            render: (_, r) => (
              <>
                <Button type="link" onClick={() => open(r)}>
                  ویرایش
                </Button>
                <Popconfirm
                  title="این متن حذف شود؟"
                  okText="حذف"
                  cancelText="انصراف"
                  onConfirm={async () => {
                    await api.del(`/api/admin/texts/${r.id}`);
                    void qc.invalidateQueries({ queryKey: ['texts'] });
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
        title={editing === 'new' ? 'افزودن متن' : 'ویرایش متن'}
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
          <Form.Item name="key" label="کلید یکتا (انگلیسی، مثلاً footer)" rules={[{ required: true, message: 'الزامی است' }]}>
            <Input dir="ltr" />
          </Form.Item>
          <LangTabs>
            {(code, dir) => (
              <Form.Item name={['content', code]} label="متن">
                <Input.TextArea rows={4} dir={dir} />
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
