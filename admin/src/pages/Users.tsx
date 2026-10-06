import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, Input, Modal, Popconfirm, Select, Switch, Table, Tag } from 'antd';
import { useState } from 'react';
import { api } from '../lib/api';
import { formatDate, toAscii } from '../lib/format';
import type { Paged, RoleLookup, UserRow } from '../lib/types';

type FormValues = {
  fullName: string;
  userName: string;
  email?: string;
  phone?: string;
  password?: string;
  roles: string[];
  isActive: boolean;
};

export default function UsersPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, isFetching } = useQuery({
    queryKey: ['users', q, page],
    queryFn: () => api.get<Paged<UserRow>>(`/api/admin/users?page=${page}&pageSize=20&q=${encodeURIComponent(q)}`),
  });
  const { data: roles } = useQuery({ queryKey: ['roles-lookup'], queryFn: () => api.get<RoleLookup[]>('/api/admin/roles/lookup') });

  function open(u: UserRow | 'new') {
    form.resetFields();
    setEditing(u);
    if (u === 'new') {
      form.setFieldsValue({ roles: [], isActive: true });
    } else {
      form.setFieldsValue({
        fullName: u.fullName,
        userName: u.userName ?? '',
        email: u.email ?? '',
        phone: u.phone ?? '',
        roles: u.roles,
        isActive: !u.isDisabled,
      });
    }
  }

  async function save() {
    const v = await form.validateFields();
    setSaving(true);
    try {
      const body = {
        fullName: v.fullName,
        userName: toAscii(v.userName ?? ''),
        email: v.email || null,
        phone: v.phone ? toAscii(v.phone) : null,
        password: v.password || null,
        roles: v.roles ?? [],
        isActive: v.isActive ?? true,
      };
      if (editing === 'new') await api.post('/api/admin/users', body);
      else if (editing) await api.put(`/api/admin/users/${editing.id}`, body);
      message.success('ذخیره شد');
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['users'] });
      void qc.invalidateQueries({ queryKey: ['roles'] });
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-title">
        <h1>کاربران</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open('new')}>
          افزودن کاربر
        </Button>
      </div>

      <Input.Search
        allowClear
        placeholder="جستجو: نام، نام کاربری، ایمیل، موبایل"
        style={{ maxWidth: 380, marginBottom: 16 }}
        onSearch={(v) => {
          setPage(1);
          setQ(v);
        }}
      />

      <Table
        rowKey="id"
        loading={isFetching}
        dataSource={data?.items ?? []}
        scroll={{ x: 'max-content' }}
        pagination={{ current: page, pageSize: 20, total: data?.total ?? 0, onChange: setPage, showSizeChanger: false }}
        columns={[
          { title: 'نام', dataIndex: 'fullName' },
          { title: 'نام کاربری', dataIndex: 'userName', render: (v: string | null) => <span dir="ltr">{v}</span> },
          { title: 'موبایل', dataIndex: 'phone', render: (v: string | null) => <span dir="ltr">{v ?? '—'}</span> },
          {
            title: 'نقش‌ها',
            dataIndex: 'roles',
            render: (r: string[]) => (r.length ? r.map((x) => <Tag key={x}>{x}</Tag>) : <span style={{ color: '#999' }}>—</span>),
          },
          { title: 'وضعیت', dataIndex: 'isDisabled', render: (d: boolean) => (d ? <Tag color="red">غیرفعال</Tag> : <Tag color="green">فعال</Tag>) },
          { title: 'عضویت', dataIndex: 'createdAt', render: (v: string) => formatDate(v, false) },
          {
            title: 'عملیات',
            render: (_, u) => (
              <>
                <Button type="link" onClick={() => open(u)}>
                  ویرایش
                </Button>
                <Popconfirm
                  title="این کاربر حذف شود؟"
                  okText="حذف"
                  cancelText="انصراف"
                  onConfirm={async () => {
                    try {
                      await api.del(`/api/admin/users/${u.id}`);
                      void qc.invalidateQueries({ queryKey: ['users'] });
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
        title={editing === 'new' ? 'افزودن کاربر' : 'ویرایش کاربر'}
        okText="ذخیره"
        cancelText="انصراف"
        confirmLoading={saving}
        onOk={() => void save()}
        onCancel={() => setEditing(null)}
        forceRender
      >
        <Form form={form} layout="vertical">
          <Form.Item name="fullName" label="نام و نام خانوادگی" rules={[{ required: true, message: 'الزامی است' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="userName" label="نام کاربری" rules={[{ required: true, message: 'الزامی است' }]}>
            <Input dir="ltr" autoComplete="off" />
          </Form.Item>
          <Form.Item name="email" label="ایمیل">
            <Input dir="ltr" />
          </Form.Item>
          <Form.Item name="phone" label="موبایل">
            <Input dir="ltr" placeholder="09123456789" />
          </Form.Item>
          <Form.Item
            name="password"
            label={editing === 'new' ? 'رمز عبور' : 'رمز عبور جدید (خالی = بدون تغییر)'}
            rules={editing === 'new' ? [{ required: true, message: 'الزامی است' }, { min: 8, message: 'حداقل ۸ کاراکتر' }] : []}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="roles" label="نقش‌ها">
            <Select mode="multiple" options={(roles ?? []).map((r) => ({ value: r.name, label: r.name }))} placeholder="انتخاب نقش" />
          </Form.Item>
          <Form.Item name="isActive" label="فعال" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
