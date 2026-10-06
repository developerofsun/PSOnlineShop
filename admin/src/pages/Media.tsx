import { CopyOutlined, DeleteOutlined, InboxOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Pagination, Popconfirm, Space, Upload } from 'antd';
import { useState } from 'react';
import { api } from '../lib/api';
import { formatBytes } from '../lib/format';
import type { Media, Paged } from '../lib/types';

export default function MediaPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isFetching } = useQuery({
    queryKey: ['media', page],
    queryFn: () => api.get<Paged<Media>>(`/api/admin/media?page=${page}&pageSize=30`),
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ['media'] });

  return (
    <>
      <div className="page-title">
        <h1>کتابخانه رسانه</h1>
      </div>

      <Upload.Dragger
        multiple
        showUploadList={false}
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ marginBottom: 16 }}
        customRequest={async ({ file, onSuccess, onError }) => {
          const fd = new FormData();
          fd.append('file', file as File);
          try {
            await api.post('/api/admin/media', fd);
            onSuccess?.({});
            refresh();
          } catch (e) {
            message.error(e instanceof Error ? e.message : 'آپلود ناموفق بود');
            onError?.(e as Error);
          }
        }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p>فایل‌ها را اینجا رها کنید یا کلیک کنید (حداکثر ۱۰ مگابایت)</p>
      </Upload.Dragger>

      <Card loading={isFetching && !data}>
        <div className="media-grid">
          {data?.items.map((m) => (
            <div key={m.id} className="media-item">
              <img src={m.url} alt={m.originalName} loading="lazy" />
              <div style={{ fontSize: 12, color: '#666', margin: '4px 0' }} title={m.originalName}>
                {formatBytes(m.size)}
              </div>
              <Space size={4}>
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => {
                    void navigator.clipboard?.writeText(m.url);
                    message.success('آدرس کپی شد');
                  }}
                />
                <Popconfirm
                  title="حذف این فایل؟"
                  okText="حذف"
                  cancelText="انصراف"
                  onConfirm={async () => {
                    await api.del(`/api/admin/media/${m.id}`);
                    refresh();
                  }}
                >
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            </div>
          ))}
        </div>
        {data && data.total > data.pageSize && (
          <Pagination style={{ marginTop: 16 }} current={page} pageSize={data.pageSize} total={data.total} onChange={setPage} showSizeChanger={false} />
        )}
      </Card>
    </>
  );
}
