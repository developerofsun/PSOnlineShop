import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Checkbox, Form, Input, Modal, Popconfirm, Table, Tag } from 'antd';
import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { formatNumber } from '../lib/format';
import type { PermissionDef, RoleRow } from '../lib/types';

export default function RolesPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<{ name: string; permissions: string[] }>();
  const [editing, setEditing] = useState<RoleRow | 'new' | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: roles, isFetching } = useQuery({ queryKey: ['roles'], queryFn: () => api.get<RoleRow[]>('/api/admin/roles') });
  const { data: perms } = useQuery({ queryKey: ['permissions'], queryFn: () => api.get<PermissionDef[]>('/api/admin/roles/permissions') });

  const groups = useMemo(() => {
    const m = new Map<string, PermissionDef[]>();
    for (const p of perms ?? []) m.set(p.group, [...(m.get(p.group) ?? []), p]);
    return [...m.entries()];
  }, [perms]);

  const locked = editing !== 'new' && editing?.name === 'Admin';

  function open(r: RoleRow | 'new') {
    form.resetFields();
    setEditing(r);
    form.setFieldsValue(r === 'new' ? { name: '', permissions: [] } : { name: r.name, permissions: r.permissions });
  }

  async function save() {
    const v = await form.validateFields();
    setSaving(true);
    try {
      const body = { name: v.name, permissions: v.permissions ?? [] };
      if (editing === 'new') await api.post('/api/admin/roles', body);
      else if (editing) await api.put(`/api/admin/roles/${editing.id}`, body);
      message.success('ذخیره شد');
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['roles'] });
      void qc.invalidateQueries({ queryKey: ['roles-lookup'] });
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-title">
        <h1>نقش‌ها و دسترسی‌ها</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open('new')}>
          افزودن نقش
        </Button>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="هر کاربر می‌تواند چند نقش داشته باشد و مجموع دسترسی‌های نقش‌ها اعمال می‌شود. تغییر دسترسی‌ها ظرف چند ثانیه اعمال می‌شود."
      />

      <Table
        rowKey="id"
        loading={isFetching}
        dataSource={roles ?? []}
        pagination={false}
        scroll={{ x: 'max-content' }}
        columns={[
          {
            title: 'نقش',
            dataIndex: 'name',
            render: (n: string, r) => (
              <>
                {n} {r.isSystem && <Tag>سیستمی</Tag>}
              </>
            ),
          },
          { title: 'کاربران', dataIndex: 'userCount', render: (v: number) => formatNumber(v) },
          { title: 'تعداد دسترسی', dataIndex: 'permissions', render: (p: string[]) => formatNumber(p.length) },
          {
            title: 'عملیات',
            render: (_, r) => (
              <>
                <Button type="link" onClick={() => open(r)}>
                  {r.name === 'Admin' ? 'مشاهده' : 'ویرایش'}
                </Button>
                {!r.isSystem && (
                  <Popconfirm
                    title="این نقش حذف شود؟"
                    okText="حذف"
                    cancelText="انصراف"
                    onConfirm={async () => {
                      try {
                        await api.del(`/api/admin/roles/${r.id}`);
                        void qc.invalidateQueries({ queryKey: ['roles'] });
                        void qc.invalidateQueries({ queryKey: ['roles-lookup'] });
                      } catch (e) {
                        message.error(e instanceof Error ? e.message : 'خطا');
                      }
                    }}
                  >
                    <Button type="link" danger>
                      حذف
                    </Button>
                  </Popconfirm>
                )}
              </>
            ),
          },
        ]}
      />

      <Modal
        open={editing !== null}
        title={editing === 'new' ? 'افزودن نقش' : `نقش: ${editing?.name ?? ''}`}
        okText="ذخیره"
        cancelText={locked ? 'بستن' : 'انصراف'}
        okButtonProps={{ disabled: locked }}
        confirmLoading={saving}
        onOk={() => void save()}
        onCancel={() => setEditing(null)}
        width={620}
        forceRender
      >
        {locked && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="نقش Admin همیشه همه دسترسی‌ها را دارد و قابل ویرایش نیست." />}
        <Form form={form} layout="vertical" disabled={locked}>
          <Form.Item name="name" label="نام نقش" rules={[{ required: true, message: 'الزامی است' }]}>
            <Input disabled={locked || (editing !== 'new' && !!editing?.isSystem)} />
          </Form.Item>

          <Form.Item name="permissions" label="دسترسی‌ها">
            <Checkbox.Group style={{ width: '100%' }}>
              {groups.map(([group, list]) => (
                <div key={group} style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{group}</div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {list.map((p) => (
                      <Checkbox key={p.key} value={p.key}>
                        {p.label}
                      </Checkbox>
                    ))}
                  </div>
                </div>
              ))}
            </Checkbox.Group>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
