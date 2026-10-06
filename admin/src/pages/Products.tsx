import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Input, Popconfirm, Table, Tag } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatNumber, formatToman } from '../lib/format';
import type { AdminProductListItem, Paged } from '../lib/types';

export default function ProductsPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const { data, isFetching } = useQuery({
    queryKey: ['products', q, page],
    queryFn: () => api.get<Paged<AdminProductListItem>>(`/api/admin/products?page=${page}&pageSize=20&q=${encodeURIComponent(q)}`),
  });

  const del = useMutation({
    mutationFn: (id: number) => api.del(`/api/admin/products/${id}`),
    onSuccess: () => {
      message.success('محصول حذف شد');
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

      <Input.Search
        allowClear
        placeholder="جستجو بر اساس نام یا SKU"
        style={{ maxWidth: 360, marginBottom: 16 }}
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
          { title: '', dataIndex: 'image', width: 64, render: (v: string | null) => (v ? <img className="thumb" src={v} alt="" /> : <div className="thumb" />) },
          { title: 'نام', dataIndex: 'name', render: (v: string | null, r) => <Link to={`/products/${r.id}`}>{v ?? '—'}</Link> },
          { title: 'SKU', dataIndex: 'sku', render: (v: string) => <span dir="ltr">{v}</span> },
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
          { title: 'وضعیت', dataIndex: 'isPublished', render: (v: boolean) => (v ? <Tag color="green">منتشرشده</Tag> : <Tag>پیش‌نویس</Tag>) },
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
