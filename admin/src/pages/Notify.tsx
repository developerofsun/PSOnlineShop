import { DeleteOutlined, DownloadOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Popconfirm, Table, Tag } from 'antd';
import { api, getToken } from '../lib/api';
import { formatDate, formatNumber } from '../lib/format';

type Signup = { id: number; phone: string; source: string | null; createdAt: string };

/**
 * Phone numbers left by visitors while the site runs in test mode (Settings → Test mode).
 * Export gives one number per line, ready to paste into an SMS panel.
 */
export default function NotifyPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();

  const { data, isFetching } = useQuery({
    queryKey: ['notify-signups'],
    queryFn: () => api.get<Signup[]>('/api/admin/notify/signups'),
  });

  async function remove(id: number) {
    try {
      await api.del(`/api/admin/notify/signups/${id}`);
      message.success('حذف شد');
      void qc.invalidateQueries({ queryKey: ['notify-signups'] });
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'خطا در حذف');
    }
  }

  /** The CSV endpoint needs the bearer token, so fetch it and save the blob. */
  async function exportCsv() {
    try {
      const res = await fetch('/api/admin/notify/signups.csv', {
        headers: { Authorization: `Bearer ${getToken() ?? ''}` },
      });
      if (!res.ok) throw new Error(`خطا (${res.status})`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = 'notify-signups.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'خطا در دریافت فایل');
    }
  }

  return (
    <>
      <div className="page-title">
        <h1>اعلان‌ها (شماره‌های ثبت‌شده)</h1>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="این شماره‌ها را کاربران در حالت آزمایشی ثبت کرده‌اند تا زمان راه‌اندازی فروشگاه باخبر شوند."
        description="برای ارسال پیامک، فایل CSV را بگیرید؛ هر خط یک شماره موبایل است."
      />

      <Card
        extra={
          <Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={!data?.length}>
            دریافت فایل CSV
          </Button>
        }
        title={`${formatNumber(data?.length ?? 0)} شماره`}
      >
        <Table<Signup>
          rowKey="id"
          loading={isFetching}
          dataSource={data ?? []}
          pagination={{ pageSize: 50, showSizeChanger: false }}
          columns={[
            { title: '#', width: 70, render: (_, __, i) => formatNumber(i + 1) },
            { title: 'شماره موبایل', dataIndex: 'phone', render: (p: string) => <span dir="ltr">{p}</span> },
            {
              title: 'زبان صفحه',
              dataIndex: 'source',
              width: 110,
              render: (s: string | null) => (s ? <Tag>{s}</Tag> : '—'),
            },
            { title: 'تاریخ ثبت', dataIndex: 'createdAt', width: 180, render: (d: string) => formatDate(d) },
            {
              title: '',
              width: 60,
              render: (_, r) => (
                <Popconfirm title="این شماره حذف شود؟" onConfirm={() => remove(r.id)} okText="حذف" cancelText="انصراف">
                  <Button danger type="text" icon={<DeleteOutlined />} />
                </Popconfirm>
              ),
            },
          ]}
        />
      </Card>
    </>
  );
}
