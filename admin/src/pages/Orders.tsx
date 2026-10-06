import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Descriptions, Drawer, Input, Select, Table, Tag } from 'antd';
import { useState } from 'react';
import { api } from '../lib/api';
import { STATUS, formatDate, formatNumber, formatToman } from '../lib/format';
import type { OrderDetail, OrderListItem, OrderStatus, Paged } from '../lib/types';

export default function OrdersPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [status, setStatus] = useState<OrderStatus | undefined>();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);

  const { data, isFetching } = useQuery({
    queryKey: ['orders', status, q, page],
    queryFn: () =>
      api.get<Paged<OrderListItem>>(`/api/admin/orders?page=${page}&pageSize=20&q=${encodeURIComponent(q)}${status ? `&status=${status}` : ''}`),
  });

  const { data: order, isFetching: loadingOrder } = useQuery({
    queryKey: ['order', openId],
    queryFn: () => api.get<OrderDetail>(`/api/admin/orders/${openId}`),
    enabled: openId !== null,
  });

  async function changeStatus(id: number, s: OrderStatus) {
    try {
      await api.put(`/api/admin/orders/${id}/status`, { status: s });
      message.success('وضعیت به‌روزرسانی شد');
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['order', id] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'خطا');
    }
  }

  const statusOptions = (Object.keys(STATUS) as OrderStatus[]).map((s) => ({ value: s, label: STATUS[s].label }));

  return (
    <>
      <div className="page-title">
        <h1>سفارش‌ها</h1>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <Input.Search
          allowClear
          placeholder="شماره سفارش، نام یا موبایل"
          style={{ maxWidth: 320 }}
          onSearch={(v) => {
            setPage(1);
            setQ(v);
          }}
        />
        <Select
          allowClear
          placeholder="همه وضعیت‌ها"
          style={{ minWidth: 180 }}
          options={statusOptions}
          onChange={(v) => {
            setPage(1);
            setStatus(v);
          }}
        />
      </div>

      <Table
        rowKey="id"
        loading={isFetching}
        dataSource={data?.items ?? []}
        scroll={{ x: 'max-content' }}
        pagination={{ current: page, pageSize: 20, total: data?.total ?? 0, onChange: setPage, showSizeChanger: false }}
        onRow={(r) => ({ onClick: () => setOpenId(r.id), style: { cursor: 'pointer' } })}
        columns={[
          { title: 'شماره', dataIndex: 'number', render: (v: string) => <span dir="ltr">{v}</span> },
          { title: 'مشتری', dataIndex: 'fullName' },
          { title: 'موبایل', dataIndex: 'phone', render: (v: string) => <span dir="ltr">{v}</span> },
          { title: 'مبلغ', dataIndex: 'total', render: (v: number) => formatToman(v) },
          { title: 'وضعیت', dataIndex: 'status', render: (s: OrderStatus) => <Tag color={STATUS[s].color}>{STATUS[s].label}</Tag> },
          { title: 'تاریخ', dataIndex: 'createdAt', render: (v: string) => formatDate(v) },
        ]}
      />

      <Drawer open={openId !== null} onClose={() => setOpenId(null)} width={520} title={order ? `سفارش ${order.number}` : 'سفارش'} loading={loadingOrder && !order}>
        {order && (
          <>
            <div style={{ marginBottom: 16 }}>
              <span style={{ marginInlineEnd: 8 }}>وضعیت:</span>
              <Select
                value={order.status}
                style={{ minWidth: 200 }}
                options={statusOptions}
                onChange={(s) => void changeStatus(order.id, s)}
              />
            </div>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="گیرنده">{order.fullName}</Descriptions.Item>
              <Descriptions.Item label="موبایل">
                <span dir="ltr">{order.phone}</span>
              </Descriptions.Item>
              <Descriptions.Item label="آدرس">
                {order.province}، {order.city}، {order.address}
              </Descriptions.Item>
              <Descriptions.Item label="کد پستی">{order.postalCode}</Descriptions.Item>
              {order.lat != null && order.lng != null && (
                <Descriptions.Item label="موقعیت روی نقشه">
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${order.lat}&mlon=${order.lng}#map=17/${order.lat}/${order.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    dir="ltr"
                  >
                    {order.lat.toFixed(5)}, {order.lng.toFixed(5)} ↗
                  </a>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="تاریخ ثبت">{formatDate(order.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="تاریخ پرداخت">{formatDate(order.paidAt)}</Descriptions.Item>
              <Descriptions.Item label="کد پیگیری پرداخت">
                <span dir="ltr">{order.paymentRef ?? '—'}</span>
              </Descriptions.Item>
              {order.note && <Descriptions.Item label="توضیحات">{order.note}</Descriptions.Item>}
            </Descriptions>

            <Table
              style={{ marginTop: 16 }}
              size="small"
              rowKey={(_, i) => String(i)}
              pagination={false}
              dataSource={order.items}
              columns={[
                { title: 'محصول', dataIndex: 'name' },
                { title: 'تعداد', dataIndex: 'quantity', render: (v: number) => formatNumber(v) },
                { title: 'قیمت واحد', dataIndex: 'unitPrice', render: (v: number) => formatNumber(v) },
              ]}
              summary={() => (
                <Table.Summary>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={2}>
                      هزینه ارسال
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1}>{formatNumber(order.shippingCost)}</Table.Summary.Cell>
                  </Table.Summary.Row>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={2}>
                      <b>مجموع</b>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1}>
                      <b>{formatToman(order.total)}</b>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              )}
            />
          </>
        )}
      </Drawer>
    </>
  );
}
