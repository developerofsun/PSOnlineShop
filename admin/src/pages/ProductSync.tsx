import { SyncOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, InputNumber, Space, Switch, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatDate, formatNumber } from '../lib/format';
import type { ProductSyncRun, ProductSyncStatus } from '../lib/types';

const STATUS_COLOR = { Running: 'blue', Succeeded: 'green', Failed: 'red' } as const;
const STATUS_LABEL = { Running: 'در حال اجرا', Succeeded: 'موفق', Failed: 'ناموفق' } as const;

export default function ProductSyncPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(true);
  const [interval, setInterval] = useState(15);

  const { data, isFetching } = useQuery({
    queryKey: ['product-sync'],
    queryFn: () => api.get<ProductSyncStatus>('/api/admin/product-sync'),
    refetchInterval: (q) => (q.state.data?.running ? 3000 : 30000),
  });

  useEffect(() => {
    if (data) {
      setEnabled(data.enabled);
      setInterval(data.intervalMinutes);
    }
  }, [data?.enabled, data?.intervalMinutes]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['product-sync'] });
    void qc.invalidateQueries({ queryKey: ['products'] });
  };

  const run = useMutation({
    mutationFn: () => api.post<ProductSyncRun>('/api/admin/product-sync/run'),
    onSuccess: (r) => {
      if (r.status === 'Succeeded') message.success(`همگام‌سازی انجام شد: ${formatNumber(r.created)} جدید، ${formatNumber(r.updated)} به‌روز`);
      else message.error(r.error ?? 'همگام‌سازی ناموفق بود');
      refresh();
    },
    onError: (e: Error) => message.error(e.message),
  });

  const save = useMutation({
    mutationFn: () => api.put('/api/admin/product-sync/settings', { enabled, intervalMinutes: interval }),
    onSuccess: () => {
      message.success('تنظیمات ذخیره شد');
      refresh();
    },
    onError: (e: Error) => message.error(e.message),
  });

  return (
    <>
      <div className="page-title">
        <h1>همگام‌سازی محصولات با کیان</h1>
        <Button type="primary" icon={<SyncOutlined spin={run.isPending || !!data?.running} />} loading={run.isPending} disabled={!data?.configured || data?.running} onClick={() => run.mutate()}>
          همگام‌سازی همین حالا
        </Button>
      </div>

      {data && !data.configured && <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="آدرس سرویس کیان (Kyan:BaseUrl) تنظیم نشده است." />}

      {!!data?.pendingReview && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={`${formatNumber(data.pendingReview)} محصول واردشده منتظر بررسی شماست`}
          description="این محصولات منتشر نشده‌اند و در «بدون دسته‌بندی» قرار دارند. دسته‌ی پیشنهادی را تأیید کنید و سپس محصول را منتشر کنید."
          action={
            <Link to="/products?review=1">
              <Button size="small">بررسی محصولات</Button>
            </Link>
          }
        />
      )}

      {!!data?.missingFromFeed && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`${formatNumber(data.missingFromFeed)} محصول در آخرین همگام‌سازی در کیان یافت نشد`}
          description="این محصولات حذف یا تغییر داده نشده‌اند؛ موجودی و قیمت آن‌ها همان مقدار آخرین همگام‌سازی موفق است."
        />
      )}

      <Card title="زمان‌بندی" style={{ marginBottom: 16 }} loading={!data}>
        <Space wrap size="large">
          <Space>
            <Switch checked={enabled} onChange={setEnabled} />
            <span>همگام‌سازی خودکار</span>
          </Space>
          <Space>
            <span>هر</span>
            <InputNumber min={1} max={1440} value={interval} onChange={(v) => setInterval(v ?? 15)} />
            <span>دقیقه</span>
          </Space>
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            ذخیره
          </Button>
        </Space>
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          فقط نام، قیمت، قیمت حراج، موجودی و بارکد به‌روز می‌شوند. توضیحات، تصاویر، دسته‌بندی، نامک و وضعیت انتشار هرگز تغییر نمی‌کنند و هیچ محصولی حذف نمی‌شود.
        </Typography.Paragraph>
      </Card>

      <Card title="آخرین اجراها">
        <Table
          rowKey="id"
          size="small"
          loading={isFetching && !data}
          dataSource={data?.runs ?? []}
          pagination={false}
          scroll={{ x: 'max-content' }}
          expandable={{
            rowExpandable: (r) => !!r.error || !!r.warnings,
            expandedRowRender: (r) => (
              <>
                {r.error && <Alert type="error" message={r.error} style={{ marginBottom: 8 }} />}
                {r.warnings && <pre dir="ltr" style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>{r.warnings}</pre>}
              </>
            ),
          }}
          columns={[
            { title: 'شروع', dataIndex: 'startedAt', render: (v: string) => formatDate(v) },
            { title: 'پایان', dataIndex: 'finishedAt', render: (v: string | null) => formatDate(v) },
            { title: 'نوع', dataIndex: 'trigger', render: (v: string) => (v === 'Manual' ? 'دستی' : 'خودکار') },
            { title: 'وضعیت', dataIndex: 'status', render: (v: ProductSyncRun['status']) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v]}</Tag> },
            { title: 'دریافتی', dataIndex: 'fetched', render: formatNumber },
            { title: 'جدید', dataIndex: 'created', render: formatNumber },
            { title: 'به‌روز', dataIndex: 'updated', render: formatNumber },
            { title: 'بدون تغییر', dataIndex: 'unchanged', render: formatNumber },
            { title: 'ردشده', dataIndex: 'skipped', render: formatNumber },
            { title: 'خارج از فید', dataIndex: 'notInFeed', render: formatNumber },
          ]}
        />
      </Card>
    </>
  );
}
