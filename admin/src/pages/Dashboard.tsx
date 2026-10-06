import { useQuery } from '@tanstack/react-query';
import { Card, Col, Empty, List, Row, Statistic, Table, Tag, Tooltip } from 'antd';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { STATUS, formatDate, formatNumber, formatToman } from '../lib/format';
import type { Dashboard } from '../lib/types';

export default function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dashboard>('/api/admin/dashboard') });
  const max = Math.max(1, ...(data?.last14Days.map((d) => d.revenue) ?? [1]));

  return (
    <>
      <div className="page-title">
        <h1>پیشخوان</h1>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card loading={isLoading}>
            <Statistic title="فروش ۳۰ روز اخیر" value={formatToman(data?.revenue30Days ?? 0)} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card loading={isLoading}>
            <Statistic title="سفارش‌های امروز" value={formatNumber(data?.ordersToday ?? 0)} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card loading={isLoading}>
            <Statistic title="سفارش‌های نیازمند رسیدگی" value={formatNumber(data?.pendingOrders ?? 0)} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card loading={isLoading}>
            <Statistic title="محصولات / مشتریان" value={`${formatNumber(data?.productsCount ?? 0)} / ${formatNumber(data?.customersCount ?? 0)}`} />
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          <Card title="فروش ۱۴ روز اخیر" loading={isLoading}>
            <div className="bars">
              {data?.last14Days.map((d) => (
                <Tooltip key={d.date} title={`${formatDate(d.date + 'T12:00:00Z', false)} — ${formatToman(d.revenue)} (${formatNumber(d.orders)} سفارش)`}>
                  <div className="bar" style={{ height: `${(d.revenue / max) * 100}%` }} />
                </Tooltip>
              ))}
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card title="موجودی کم" loading={isLoading}>
            {data && data.lowStock.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="همه‌چیز مرتب است" />
            ) : (
              <List
                size="small"
                dataSource={data?.lowStock ?? []}
                renderItem={(p) => (
                  <List.Item extra={<Tag color={p.stock === 0 ? 'red' : 'orange'}>{formatNumber(p.stock)}</Tag>}>
                    <Link to={`/products/${p.id}`}>{p.name ?? p.sku}</Link>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>

        <Col span={24}>
          <Card title="آخرین سفارش‌ها" loading={isLoading} extra={<Link to="/orders">همه سفارش‌ها</Link>}>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              scroll={{ x: 'max-content' }}
              dataSource={data?.recentOrders ?? []}
              columns={[
                { title: 'شماره', dataIndex: 'number', render: (v: string) => <span dir="ltr">{v}</span> },
                { title: 'مشتری', dataIndex: 'fullName' },
                { title: 'مبلغ', dataIndex: 'total', render: (v: number) => formatToman(v) },
                {
                  title: 'وضعیت',
                  dataIndex: 'status',
                  render: (s: keyof typeof STATUS) => <Tag color={STATUS[s].color}>{STATUS[s].label}</Tag>,
                },
                { title: 'تاریخ', dataIndex: 'createdAt', render: (v: string) => formatDate(v) },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </>
  );
}
