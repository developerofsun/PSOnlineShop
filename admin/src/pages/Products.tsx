import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Input, Popconfirm, Select, Space, Switch, Table, Tag } from 'antd';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { formatNumber, formatToman } from '../lib/format';
import type { AdminProductListItem, CategoryItem, Paged } from '../lib/types';

export default function ProductsPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [params, setParams] = useSearchParams();
  const review = params.get('review') === '1';

  const { data, isFetching } = useQuery({
    queryKey: ['products', q, page, review],
    queryFn: () =>
      api.get<Paged<AdminProductListItem>>(`/api/admin/products?page=${page}&pageSize=20&q=${encodeURIComponent(q)}${review ? '&needsReview=true' : ''}`),
  });
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => api.get<CategoryItem[]>('/api/admin/categories') });

  const del = useMutation({
    mutationFn: (id: number) => api.del(`/api/admin/products/${id}`),
    onSuccess: () => {
      message.success('محصول حذف شد');
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['product-sync'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  // Approve the suggested category (no id) or pick another one. The product stays a draft until it is published.
  const setCategory = useMutation({
    mutationFn: (v: { id: number; categoryId?: number }) => api.post(`/api/admin/product-sync/review/${v.id}/category`, { categoryId: v.categoryId ?? null }),
    onSuccess: () => {
      message.success('دسته‌بندی ثبت شد');
      void qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  return (
    <>
      <div className="page-title">
        <h1>محصولات</h1>
        <Link to="/products/new">
          <Button type="primary" icon={<PlusOutlined />}>
            افزودن محصول
          </Button>
        </Link>
      </div>

      <Space wrap style={{ marginBottom: 16 }}>
        <Input.Search
          allowClear
          placeholder="جستجو بر اساس نام، SKU یا بارکد"
          style={{ width: 360 }}
          onSearch={(v) => {
            setPage(1);
            setQ(v);
          }}
        />
        <Space>
          <Switch
            checked={review}
            onChange={(on) => {
              setPage(1);
              setParams(on ? { review: '1' } : {});
            }}
          />
          <span>فقط محصولات منتظر بررسی (واردشده از کیان)</span>
        </Space>
      </Space>

      <Table
        rowKey="id"
        loading={isFetching}
        dataSource={data?.items ?? []}
        scroll={{ x: 'max-content' }}
        pagination={{ current: page, pageSize: 20, total: data?.total ?? 0, onChange: setPage, showSizeChanger: false }}
        columns={[
          { title: '', dataIndex: 'image', width: 64, render: (v: string | null) => (v ? <img className="thumb" src={v} alt="" /> : <div className="thumb" />) },
          { title: 'نام', dataIndex: 'name', render: (v: string | null, r) => <Link to={`/products/${r.id}`}>{v ?? '—'}</Link> },
          { title: 'SKU', dataIndex: 'sku', render: (v: string) => <span dir="ltr">{v}</span> },
          { title: 'بارکد', dataIndex: 'barcode', render: (v: string | null) => (v ? <span dir="ltr">{v}</span> : '—') },
          {
            title: 'قیمت',
            render: (_, r) =>
              r.salePrice != null ? (
                <>
                  {formatToman(r.salePrice)} <s style={{ color: '#999' }}>{formatNumber(r.price)}</s>
                </>
              ) : (
                formatToman(r.price)
              ),
          },
          { title: 'موجودی', dataIndex: 'stock', render: (v: number) => <Tag color={v === 0 ? 'red' : v <= 5 ? 'orange' : 'green'}>{formatNumber(v)}</Tag> },
          {
            title: 'وضعیت',
            render: (_, r) => (
              <>
                {r.isPublished ? <Tag color="green">منتشرشده</Tag> : <Tag>پیش‌نویس</Tag>}
                {r.needsReview && <Tag color="blue">منتظر بررسی</Tag>}
                {r.missingFromFeed && <Tag color="orange">در کیان یافت نشد</Tag>}
              </>
            ),
          },
          ...(review
            ? [
                {
                  title: 'دسته‌بندی',
                  render: (_: unknown, r: AdminProductListItem) => (
                    <Space direction="vertical" size={4}>
                      {r.suggestedCategoryId != null && (
                        <Button size="small" type="primary" loading={setCategory.isPending} onClick={() => setCategory.mutate({ id: r.id })}>
                          تأیید «{r.suggestedCategoryName ?? `#${r.suggestedCategoryId}`}»
                        </Button>
                      )}
                      <Select
                        size="small"
                        showSearch
                        optionFilterProp="label"
                        style={{ minWidth: 180 }}
                        placeholder={r.suggestedCategoryId != null ? 'انتخاب دسته‌ی دیگر' : 'انتخاب دسته'}
                        options={(categories ?? []).map((c) => ({ value: c.id, label: c.name ?? `#${c.id}` }))}
                        onChange={(categoryId: number) => setCategory.mutate({ id: r.id, categoryId })}
                      />
                    </Space>
                  ),
                },
              ]
            : []),
          {
            title: 'عملیات',
            render: (_, r) => (
              <>
                <Link to={`/products/${r.id}`}>ویرایش</Link>{' '}
                <Popconfirm title="این محصول حذف شود؟" okText="حذف" cancelText="انصراف" onConfirm={() => del.mutate(r.id)}>
                  <Button type="link" danger>
                    حذف
                  </Button>
                </Popconfirm>
              </>
            ),
          },
        ]}
      />
    </>
  );
}
