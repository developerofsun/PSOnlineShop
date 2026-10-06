import { HomeOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Popconfirm, Table, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatDate, formatNumber } from '../lib/format';
import type { PageRow } from '../lib/types';

export default function PagesPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isFetching } = useQuery({ queryKey: ['pages'], queryFn: () => api.get<PageRow[]>('/api/admin/pages') });

  return (
    <>
      <div className="page-title">
        <h1>صفحات</h1>
        <Link to="/pages/new">
          <Button type="primary" icon={<PlusOutlined />}>
            افزودن صفحه
          </Button>
        </Link>
      </div>

      <Table
        rowKey="id"
        loading={isFetching}
        dataSource={data ?? []}
        pagination={false}
        scroll={{ x: 'max-content' }}
        columns={[
          {
            title: 'عنوان',
            dataIndex: 'title',
            render: (v: string | null, r) => (
              <Link to={`/pages/${r.id}`}>
                {r.isHome && <HomeOutlined style={{ marginInlineEnd: 6 }} />}
                {v ?? '—'}
              </Link>
            ),
          },
          { title: 'نامک', dataIndex: 'slug', render: (v: string | null, r) => (r.isHome ? <Tag color="blue">صفحه اصلی</Tag> : <span dir="ltr">/p/{v}</span>) },
          { title: 'بلوک‌ها', dataIndex: 'blockCount', render: (v: number) => formatNumber(v) },
          { title: 'وضعیت', dataIndex: 'isPublished', render: (v: boolean) => (v ? <Tag color="green">منتشرشده</Tag> : <Tag>پیش‌نویس</Tag>) },
          { title: 'تاریخ', dataIndex: 'createdAt', render: (v: string) => formatDate(v, false) },
          {
            title: 'عملیات',
            render: (_, r) => (
              <>
                <Link to={`/pages/${r.id}`}>ویرایش</Link>{' '}
                <Popconfirm
                  title="این صفحه حذف شود؟"
                  okText="حذف"
                  cancelText="انصراف"
                  onConfirm={async () => {
                    try {
                      await api.del(`/api/admin/pages/${r.id}`);
                      void qc.invalidateQueries({ queryKey: ['pages'] });
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
    </>
  );
}
